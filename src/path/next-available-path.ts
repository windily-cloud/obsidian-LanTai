export function nextAvailablePath(
	preferred: string,
	exists: (path: string) => boolean
): string {
	const normalized = preferred.replaceAll('\\', '/').replace(/^\/+/u, '');
	const slashIndex = normalized.lastIndexOf('/');
	const parent = slashIndex === -1 ? '' : normalized.slice(0, slashIndex);
	const fileName = slashIndex === -1 ? normalized : normalized.slice(slashIndex + 1);
	const extensionIndex = fileName.lastIndexOf('.');
	const hasExt = extensionIndex > 0;
	const baseName = hasExt ? fileName.slice(0, extensionIndex) : fileName;
	const ext = hasExt ? fileName.slice(extensionIndex + 1) : '';

	function candidateAt(index: number): string {
		let candidateName: string;
		if (index === 0) {
			candidateName = fileName;
		} else if (ext === '') {
			candidateName = `${baseName} ${String(index)}`;
		} else {
			candidateName = `${baseName} ${String(index)}.${ext}`;
		}
		return parent === '' ? candidateName : `${parent}/${candidateName}`;
	}

	let index = 0;
	let candidate = candidateAt(index);
	while (exists(candidate)) {
		index += 1;
		candidate = candidateAt(index);
	}
	return candidate;
}
