import type { TextItem } from "./statement-table";

/**
 * Reads the text positions out of a statement PDF, on this device.
 *
 * The file and its password never leave the browser: pdf.js runs here, the
 * password is only handed to it, and nothing is uploaded or stored. The library
 * is loaded when a statement is chosen, so it costs nothing until then.
 */
export class StatementPasswordError extends Error {
  constructor(readonly wrong: boolean) {
    super(wrong ? "That password did not open the statement." : "This statement needs its password.");
  }
}

export async function readStatementPages(file: File, password: string): Promise<TextItem[][]> {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const data = new Uint8Array(await file.arrayBuffer());
  let doc;
  try {
    doc = await pdfjs.getDocument({ data, password: password || undefined }).promise;
  } catch (error) {
    const named = error as { name?: string; code?: number };
    if (named?.name === "PasswordException") throw new StatementPasswordError(named.code === pdfjs.PasswordResponses.INCORRECT_PASSWORD);
    throw error;
  }

  const pages: TextItem[][] = [];
  for (let number = 1; number <= doc.numPages; number += 1) {
    const content = await (await doc.getPage(number)).getTextContent();
    pages.push(
      content.items
        .filter((item): item is (typeof content.items)[number] & { str: string; transform: number[]; width: number } => "str" in item)
        .filter((item) => item.str.trim() !== "")
        .map((item) => ({ str: item.str, x: item.transform[4], y: item.transform[5], w: item.width })),
    );
  }
  await doc.loadingTask.destroy();
  return pages;
}
