export function sourceKey(repository, sourcePath) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(repository)) throw new Error(`invalid source repository ${repository}`);
  if (typeof sourcePath !== 'string' || !sourcePath || sourcePath.includes('\0')) throw new Error('invalid source path');
  return `${repository}\0${sourcePath}`;
}

export function sourceMap(files, value) {
  const output = new Map();
  for (const file of files) output.set(sourceKey(file.repository, file.sourcePath), value(file));
  return output;
}
