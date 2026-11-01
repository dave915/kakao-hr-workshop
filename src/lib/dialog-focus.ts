/** Give each modal a stable reading position without selecting a control. */
export function openDialog(dialog: HTMLDialogElement | null) {
  if (!dialog) return;
  dialog.showModal();
  dialog
    .querySelector<HTMLElement>("[data-dialog-title]")
    ?.focus({ preventScroll: true });
}
