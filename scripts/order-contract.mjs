export function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

export function assertPortableRelativePath(value, label = 'path') {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes('\\') || /[?#]/.test(value) || /%(?:2e|2f|5c)/i.test(value) || /\p{Cc}/u.test(value)) {
    throw new Error(`${label} is not a portable relative path: ${String(value)}`);
  }
  const segments = value.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`${label} is not canonical: ${value}`);
  }
  if (segments.some((segment) => ['.git', '.gitattributes', '.gitignore'].includes(segment.toLowerCase()))) {
    throw new Error(`${label} contains forbidden Git metadata: ${value}`);
  }
  return value;
}
