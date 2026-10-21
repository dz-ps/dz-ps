/**
 * Incremental extractor for streamed JSON: yields each top-level key of the root object as soon as its value
 * is complete, so validated sections can be shown before the whole response arrives (DECISIONS.md D8).
 */
export class JsonSectionStream {
  private buffer = '';
  private pos = 0;
  private depth = 0;
  private inString = false;
  private escape = false;
  private keyStart = -1;
  private currentKey: string | null = null;
  private valueStart = -1;
  private started = false;

  push(chunk: string): [string, unknown][] {
    this.buffer += chunk;
    const done: [string, unknown][] = [];
    const s = this.buffer;
    for (; this.pos < s.length; this.pos++) {
      const ch = s[this.pos]!;
      if (this.inString) {
        if (this.escape) this.escape = false;
        else if (ch === '\\') this.escape = true;
        else if (ch === '"') {
          this.inString = false;
          if (this.depth === 1 && this.currentKey === null && this.keyStart >= 0) {
            this.currentKey = JSON.parse(s.slice(this.keyStart, this.pos + 1)) as string;
            this.keyStart = -1;
          }
        }
        continue;
      }
      if (ch === '"') {
        this.inString = true;
        if (this.depth === 1 && this.currentKey === null) this.keyStart = this.pos;
        else if (this.depth === 1 && this.valueStart < 0) this.valueStart = this.pos;
        continue;
      }
      if (ch === '{' || ch === '[') {
        if (!this.started && ch === '{') {
          this.started = true;
          this.depth = 1;
          continue;
        }
        if (this.depth === 1 && this.valueStart < 0) this.valueStart = this.pos;
        this.depth++;
        continue;
      }
      if (ch === '}' || ch === ']') {
        this.depth--;
        if (this.depth === 1 && this.currentKey !== null && this.valueStart >= 0) {
          this.emit(s.slice(this.valueStart, this.pos + 1), done);
        } else if (this.depth === 0 && this.currentKey !== null && this.valueStart >= 0) {
          this.emit(s.slice(this.valueStart, this.pos).trim(), done);
        }
        continue;
      }
      if (this.depth === 1 && this.currentKey !== null) {
        if (ch === ',') {
          if (this.valueStart >= 0) this.emit(s.slice(this.valueStart, this.pos).trim(), done);
        } else if (ch !== ':' && !/\s/.test(ch) && this.valueStart < 0) {
          this.valueStart = this.pos;
        }
      }
    }
    return done;
  }

  private emit(text: string, out: [string, unknown][]) {
    try {
      out.push([this.currentKey!, JSON.parse(text)]);
    } catch {
      // incomplete scalar (e.g. number cut mid-stream) — wait for more input
      return;
    }
    this.currentKey = null;
    this.valueStart = -1;
  }

  /** Full text received so far. */
  get text(): string {
    return this.buffer;
  }
}
