import { inviteUrl } from "./utils";
export function invitationTsv(
  invites: Array<{ handle: string; code: string }>,
) {
  return [
    "영문명\t참가링크",
    ...invites.map((invite) => {
      const handle = invite.handle.replace(/[\t\r\n]/g, " ");
      return `${/^[=+@-]/.test(handle) ? "'" : ""}${handle}\t${inviteUrl(invite.code)}`;
    }),
  ].join("\n");
}
/** Start the clipboard operation during the click gesture, including Safari. */
export async function copyPromisedText(text: Promise<string>) {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    const blob = text.then(
      (value) => new Blob([value], { type: "text/plain" }),
    );
    void blob.catch(() => {});
    await navigator.clipboard.write([
      new ClipboardItem({ "text/plain": blob }),
    ]);
  } else {
    const value = await text;
    if (!navigator.clipboard)
      throw new Error("아래 참가링크를 직접 선택해 복사해주세요.");
    await navigator.clipboard.writeText(value);
  }
}
