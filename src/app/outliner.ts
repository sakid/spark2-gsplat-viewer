export function getExtension(name: string): string {
  const ext = name.toLowerCase().split('.').pop();
  return ext ?? '';
}

