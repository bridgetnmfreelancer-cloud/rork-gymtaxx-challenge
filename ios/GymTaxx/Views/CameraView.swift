//
//  CameraView.swift
//  GymTaxx
//

import SwiftUI
import AVFoundation
import UIKit

/// SwiftUI wrapper around a UIImagePickerController for capturing a single gym
/// photo.
///
/// Live capture only — there is deliberately **no** photo library fallback.
/// Proof has to be taken at the gym in the moment; letting the user choose an
/// existing image would make the deposit trivially cheatable. Where no camera
/// exists, callers show `CameraPlaceholderView` rather than another way in.
struct CameraView: UIViewControllerRepresentable {
    @Binding var capturedImage: UIImage?

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.cameraCaptureMode = .photo
        picker.allowsEditing = false
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraView
        init(parent: CameraView) { self.parent = parent }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            if let image = info[.originalImage] as? UIImage {
                parent.capturedImage = image
            }
            picker.dismiss(animated: true)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.capturedImage = nil
            picker.dismiss(animated: true)
        }
    }
}

/// Shown when no camera is available (e.g. the cloud simulator). Workouts can
/// only be verified with a live photo, so no alternative path is offered.
struct CameraPlaceholderView: View {
    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "camera.fill")
                .font(.system(size: 56, weight: .semibold))
                .foregroundStyle(Color.navy.opacity(0.25))
            Text("No camera available")
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(Color.navy)
            Text("Workouts are verified with a live photo taken at the gym. Install GymTaxx on your iPhone to check in.")
                .font(.subheadline)
                .foregroundStyle(Color.navy.opacity(0.55))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white)
    }
}
