export type Point = { x: number; y: number };

/** Adds a model-space LINE while preserving the rest of an ASCII DXF verbatim. */
export function addLineToDxf(source: string, start: Point, end: Point): string {
  if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) {
    throw new Error("Invalid drawing coordinates");
  }
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const match = /(?:^|\r?\n)\s*0\s*\r?\n\s*SECTION\s*\r?\n\s*2\s*\r?\n\s*ENTITIES\s*\r?\n/i.exec(source);
  if (!match) throw new Error("DXF ENTITIES section not found");
  const sectionEnd = /(?:^|\r?\n)\s*0\s*\r?\n\s*ENDSEC(?=\r?\n|$)/gi;
  sectionEnd.lastIndex = match.index + match[0].length;
  const sectionEndMatch = sectionEnd.exec(source);
  if (!sectionEndMatch) throw new Error("DXF ENTITIES section is incomplete");
  const fields = ["0", "LINE", "8", "0", "10", String(start.x), "20", String(start.y), "30", "0", "11", String(end.x), "21", String(end.y), "31", "0"];
  return source.slice(0, sectionEndMatch.index) + eol + fields.join(eol) + source.slice(sectionEndMatch.index);
}
