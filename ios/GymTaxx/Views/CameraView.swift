//
//  CameraView.swift
//  GymTaxx
//

import SwiftUI
import AVFoundation
import UIKit

/// SwiftUI wrapper around a UIImagePickerController so the user can capture
/// a single gym photo. On the cloud simulator (no camera) a clean placeholder
/// is shown instead, per Rork's camera guidance.
struct CameraView: UIViewControllerRepresentable {
    @Binding var capturedImage: UIImage?
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        // Simulator has no camera — fall back to photo library so the flow
        // remains testable in preview. On a real device this uses the camera.
        if UIImagePickerController.isSourceTypeAvailable(.camera) {
            picker.sourceType = .camera
        } else {
            picker.sourceType = .photoLibrary
        }
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

/// A clean placeholder shown when no camera is available (cloud simulator).
struct CameraPlaceholderView: View {
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "camera.fill")
                .font(.system(size: 56, weight: .semibold))
                .foregroundStyle(Color.mintGreen)
            Text("Install this app on your device via the Rork App to use the camera.")
                .font(.subheadline)
                .foregroundStyle(Color.navy.opacity(0.6))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white)
    }
}
