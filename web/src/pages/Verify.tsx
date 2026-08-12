import { useQueryClient } from "@tanstack/react-query";
import { Camera, Check, Loader2, MapPin, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Screen, ScreenActions, ScreenSubtitle, ScreenTitle } from "@/components/Screen";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthProvider";
import { captureLocation, locationPermissionState, type LocationFix } from "@/lib/location";
import { currencyFrom, formatMoney } from "@/lib/money";
import { queryKeys, useCurrentChallenge, useParticipation } from "@/lib/queries";
import { REWARD_PER_WORKOUT } from "@/lib/money";
import { canvasToJpeg, submitWorkout } from "@/lib/workouts";

type Stage = "location" | "camera" | "preview" | "submitting" | "done";

/**
 * Steps 14 to 17: prove you're here.
 *
 * Live camera only — there is deliberately no way to choose an existing photo.
 * A picture from the library proves nothing, and the whole product rests on the
 * proof being worth something.
 */
export default function Verify() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: participation } = useParticipation();
  const { data: challenge } = useCurrentChallenge();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [stage, setStage] = useState<Stage>("location");
  const [isViewfinderLive, setIsViewfinderLive] = useState<boolean>(false);
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [shot, setShot] = useState<{ blob: Blob; url: string; at: Date } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState<boolean>(false);

  const currency = currencyFrom(participation?.currency);
  const reward = Number(challenge?.reward_per_workout ?? REWARD_PER_WORKOUT);

  /**
   * Cameras keep running until explicitly stopped, including in the background.
   *
   * iOS shows a camera-in-use indicator the entire time a stream is open, so
   * stopping promptly is what makes that indicator disappear the moment the
   * photo is taken.
   */
  const stopCamera = useCallback((): void => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsViewfinderLive(false);
  }, []);

  /**
   * Attach the camera the instant the <video> element exists.
   *
   * This has to be a ref callback rather than a effect or a timeout. Setting the
   * stage schedules a render, and React does not guarantee the element is in the
   * DOM by the time a `setTimeout(0)` fires — when it lost that race the stream
   * was never attached and the viewfinder stayed black.
   */
  const attachVideo = useCallback((node: HTMLVideoElement | null): void => {
    videoRef.current = node;
    if (!node) return;

    const stream = streamRef.current;
    if (!stream) return;

    if (node.srcObject !== stream) node.srcObject = stream;
    node.play().catch((caught: unknown) => {
      // Autoplay can be refused on the first attempt; the metadata handler
      // retries once the frames are actually ready.
      console.error("verify: viewfinder did not start", caught);
    });
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  // Revoke the preview blob URL when it's replaced, or it leaks for the session.
  useEffect(() => {
    return () => {
      if (shot) URL.revokeObjectURL(shot.url);
    };
  }, [shot]);

  // Skip the location explainer if they've already granted it.
  useEffect(() => {
    let active = true;
    void locationPermissionState().then((state) => {
      if (active && state === "granted") void requestLocation();
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requestLocation(): Promise<void> {
    if (isWorking) return;
    setError(null);
    setIsWorking(true);
    try {
      const result = await captureLocation();
      setFix(result);

      if (result.status === "denied") {
        setError(
          "GymTaxx needs location to confirm you're at the gym. Turn it on in your browser settings, then try again.",
        );
        return;
      }

      await startCamera();
    } finally {
      setIsWorking(false);
    }
  }

  async function startCamera(): Promise<void> {
    setIsViewfinderLive(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      setStage("camera");

      // If the element is already mounted (a retake), the ref callback won't
      // fire again, so attach here too. Both paths are idempotent.
      attachVideo(videoRef.current);
    } catch (caught) {
      console.error("verify: camera unavailable", caught);
      setError("We couldn't open your camera. Check the permission in your browser settings and try again.");
    }
  }

  async function takeShot(): Promise<void> {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Capturing before the first frame arrives yields a 0×0 canvas and a blank
    // photo, which would then fail review for no reason the person can see.
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setError("The camera is still starting up. Give it a second and tap again.");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      const blob = await canvasToJpeg(canvas);
      setShot({ blob, url: URL.createObjectURL(blob), at: new Date() });
      stopCamera();
      setStage("preview");
    } catch (caught) {
      console.error("verify: could not encode photo", caught);
      setError("That photo didn't save. Try taking it again.");
    }
  }

  async function retake(): Promise<void> {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
    setError(null);
    setStage("camera");
    await startCamera();
  }

  async function submit(): Promise<void> {
    if (!shot || !user || !participation || !fix) return;

    setStage("submitting");
    setError(null);
    try {
      await submitWorkout({
        blob: shot.blob,
        userId: user.id,
        userChallengeId: participation.id,
        capturedAt: shot.at,
        fix,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.submissions(participation.id) });
      setStage("done");
    } catch (caught) {
      console.error("verify: submission failed", caught);
      setError("We couldn't send that just now. Your photo is still here — try again when you have signal.");
      setStage("preview");
    }
  }

  if (stage === "done") {
    return (
      <Screen>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-accent animate-pop-in">
            <Check className="h-12 w-12 text-success-ink" strokeWidth={3} aria-hidden="true" />
          </div>
          <ScreenTitle className="mt-8 animate-rise-in [animation-delay:200ms]">Workout submitted</ScreenTitle>
          <ScreenSubtitle className="animate-rise-in [animation-delay:280ms]">
            We'll check it and mark it verified, usually within a few hours. That's{" "}
            {formatMoney(reward, currency)} on its way back to you.
          </ScreenSubtitle>
        </div>

        <ScreenActions>
          <Button size="xl" className="w-full" onClick={() => navigate("/home", { replace: true })}>
            Back to dashboard
          </Button>
        </ScreenActions>
      </Screen>
    );
  }

  if (stage === "camera") {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        <video
          ref={attachVideo}
          playsInline
          muted
          autoPlay
          disablePictureInPicture
          onLoadedMetadata={(event) => {
            setIsViewfinderLive(true);
            void event.currentTarget.play().catch(() => {});
          }}
          onPlaying={() => setIsViewfinderLive(true)}
          className="absolute inset-0 h-full w-full object-cover"
          aria-label="Camera viewfinder"
        />
        <canvas ref={canvasRef} className="hidden" />

        {!isViewfinderLive ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
            <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />
            <p className="text-sm font-medium">Starting the camera…</p>
          </div>
        ) : null}

        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-5 pt-safe">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              navigate(-1);
            }}
            aria-label="Cancel"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
          <p className="rounded-full bg-black/50 px-4 py-2 text-sm font-semibold text-white backdrop-blur">
            Prove you're here
          </p>
          <div className="h-11 w-11" />
        </div>

        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 pb-12">
          {error ? (
            <p role="alert" className="mx-5 rounded-md bg-black/70 px-4 py-2 text-center text-sm font-medium text-white">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void takeShot()}
            disabled={!isViewfinderLive}
            aria-label="Take photo"
            className="h-20 w-20 rounded-full border-[6px] border-white bg-white/30 transition-transform active:scale-95 disabled:opacity-40 backdrop-blur"
          />
        </div>
      </div>
    );
  }

  if (stage === "preview" || stage === "submitting") {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        {shot ? <img src={shot.url} alt="Your workout proof" className="absolute inset-0 h-full w-full object-cover" /> : null}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent px-5 pb-safe pt-16">
          {fix ? (
            <div className="mb-4 flex items-center justify-center gap-2 text-sm text-white/80">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              <span>
                {fix.status === "located" || fix.status === "approximate"
                  ? "Location and time recorded"
                  : "Time recorded — no location signal here"}
              </span>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="mb-4 rounded-md bg-destructive/90 px-4 py-3 text-sm font-medium text-white">
              {error}
            </p>
          ) : null}

          <div className="flex gap-3 pb-6">
            <Button
              size="xl"
              variant="secondary"
              className="flex-1"
              onClick={() => void retake()}
              disabled={stage === "submitting"}
            >
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
              Retake
            </Button>
            <Button size="xl" className="flex-[2]" onClick={() => void submit()} disabled={stage === "submitting"}>
              {stage === "submitting" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
              Submit workout
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Screen>
      <div className="flex flex-1 flex-col justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-accent animate-pop-in">
          <MapPin className="h-8 w-8 text-success-ink" aria-hidden="true" />
        </div>

        <ScreenTitle className="mt-8 animate-rise-in">We need your location</ScreenTitle>
        <ScreenSubtitle className="animate-rise-in [animation-delay:60ms]">
          It's what makes your proof worth something — a photo with a time and a place behind it, rather than just a
          photo.
        </ScreenSubtitle>

        <div className="mt-6 flex items-start gap-3 rounded-lg bg-card p-4 animate-rise-in [animation-delay:120ms]">
          <Camera className="mt-0.5 h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            Next you'll take a photo at the gym. If there's no signal indoors, that's fine — we record the time and
            check it by hand.
          </p>
        </div>

        {error ? (
          <p role="alert" className="mt-4 rounded-md bg-destructive/15 px-4 py-3 text-sm font-medium text-danger-ink">
            {error}
          </p>
        ) : null}
      </div>

      <ScreenActions>
        <Button size="xl" className="w-full" onClick={() => void requestLocation()} disabled={isWorking}>
          {isWorking ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
          Allow location
        </Button>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mt-3 w-full py-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
        >
          Not now
        </button>
      </ScreenActions>
    </Screen>
  );
}
