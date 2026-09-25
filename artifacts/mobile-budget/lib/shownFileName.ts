/** A file name with any long run of digits (a phone number) hidden, for showing on screen. */
export const shownFileName = (name: string): string => name.replace(/\d{6,}/g, '…');
