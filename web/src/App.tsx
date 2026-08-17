import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import { AppOpenTracker } from "@/components/AppOpenTracker";
import { OfflineBanner } from "@/components/OfflineBanner";
import { PushSync } from "@/components/PushSync";
import { RequireAuth } from "@/components/RequireAuth";
import { AuthProvider } from "@/context/AuthProvider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import Account from "./pages/Account";
import Activated from "./pages/Activated";
import BuildChallenge from "./pages/BuildChallenge";
import Commit from "./pages/Commit";
import Entry from "./pages/Entry";
import ForgotPassword from "./pages/ForgotPassword";
import History from "./pages/History";
import Home from "./pages/Home";
import Install from "./pages/Install";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";
import Onboarding from "./pages/Onboarding";
import Pay from "./pages/Pay";
import Reminders from "./pages/Reminders";
import Review from "./pages/Review";
import Stats from "./pages/Stats";
import Verify from "./pages/Verify";
import Welcome from "./pages/Welcome";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Phone screens get backgrounded constantly; refetching on focus is what
      // makes a newly approved workout appear the moment they reopen the app.
      refetchOnWindowFocus: true,
      staleTime: 30_000,
      retry: 1,
    },
  },
});

/** Every screen past the account gate, kept in one place. */
const PRIVATE_ROUTES = [
  { path: "/reminders", element: <Reminders /> },
  { path: "/onboarding", element: <Onboarding /> },
  { path: "/challenge", element: <BuildChallenge /> },
  { path: "/commit", element: <Commit /> },
  { path: "/pay", element: <Pay /> },
  { path: "/activated", element: <Activated /> },
  { path: "/home", element: <Home /> },
  { path: "/verify", element: <Verify /> },
  { path: "/history", element: <History /> },
  { path: "/account", element: <Account /> },
  { path: "/review", element: <Review /> },
  { path: "/stats", element: <Stats /> },
];

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster position="top-center" />
        <PushSync />
        <AppOpenTracker />
        <OfflineBanner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/" element={<Entry />} />
            {/* The paid-traffic landing page. Currency-neutral slug, because the
                deposit is charged in pounds or dollars depending on the reader. */}
            <Route path="/4weekchallenge" element={<Landing />} />
            <Route path="/install" element={<Install />} />
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />

            {PRIVATE_ROUTES.map((route) => (
              <Route key={route.path} path={route.path} element={<RequireAuth>{route.element}</RequireAuth>} />
            ))}

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
