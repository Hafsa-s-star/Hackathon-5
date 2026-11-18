import Swal from "sweetalert2";

const alert = Swal.mixin({
  buttonsStyling: false,
  customClass: {
    popup: "stockwise-alert",
    title: "stockwise-alert-title",
    htmlContainer: "stockwise-alert-message",
    confirmButton: "stockwise-alert-confirm",
    cancelButton: "stockwise-alert-cancel"
  }
});

export function showSuccess(message) {
  return alert.fire({ icon: "success", title: "Success", text: message, confirmButtonText: "Done" });
}

export function showError(message) {
  return alert.fire({ icon: "error", title: "Unable to complete", text: message, confirmButtonText: "Okay" });
}

export async function confirmAction({ title, text, confirmText = "Confirm" }) {
  const result = await alert.fire({
    icon: "warning",
    title,
    text,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: "Cancel",
    reverseButtons: true,
    focusCancel: true
  });
  return result.isConfirmed;
}
