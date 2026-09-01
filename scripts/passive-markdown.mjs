const managedMarker = /^\s*<!--\s*(b10x-docs(?:[-:][a-z0-9-]+)*):(start|end)\s*-->\s*$/i;

export function normalizePassiveMarkdown(source) {
  const output = [];
  let fence;
  let htmlComment = false;
  for (const original of stripManagedRanges(source).split(/\r?\n/)) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(original);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fence) fence = marker;
      else if (fence === marker) fence = undefined;
      output.push(original);
      continue;
    }
    if (fence) {
      output.push(original);
      continue;
    }
    let line = original;
    if (htmlComment) {
      const end = line.indexOf('-->');
      if (end < 0) continue;
      line = line.slice(end + 3);
      htmlComment = false;
    }
    while (line.includes('<!--')) {
      const start = line.indexOf('<!--');
      const end = line.indexOf('-->', start + 4);
      if (end < 0) {
        line = line.slice(0, start);
        htmlComment = true;
        break;
      }
      line = `${line.slice(0, start)}${line.slice(end + 3)}`;
    }
    const heading = /^(#{1,6})\s+(.+?)\s+\{#([A-Za-z][A-Za-z0-9_.:-]*)\}\s*$/.exec(line);
    if (heading) output.push(`<a id=${JSON.stringify(heading[3])}></a>`, `${heading[1]} ${heading[2]}`);
    else if (line || !htmlComment) output.push(line);
  }
  return output.join('\n');
}

export function stripManagedRanges(source) {
  const output = [];
  let fence;
  let managedRange;
  for (const line of source.split(/\r?\n/)) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (!managedRange && fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fence) fence = marker;
      else if (fence === marker) fence = undefined;
      output.push(line);
      continue;
    }
    if (fence) {
      output.push(line);
      continue;
    }
    const marker = managedMarker.exec(line);
    if (managedRange) {
      if (!marker) continue;
      if (marker[2].toLowerCase() === 'start') throw new Error(`nested managed documentation range ${marker[1]}`);
      if (marker[1].toLowerCase() !== managedRange) {
        throw new Error(`managed documentation range ${managedRange} closes as ${marker[1]}`);
      }
      managedRange = undefined;
      continue;
    }
    if (!marker) {
      output.push(line);
      continue;
    }
    if (marker[2].toLowerCase() === 'end') throw new Error(`managed documentation range ${marker[1]} ends without a start`);
    managedRange = marker[1].toLowerCase();
  }
  if (managedRange) throw new Error(`managed documentation range ${managedRange} is not closed`);
  return output.join('\n');
}
