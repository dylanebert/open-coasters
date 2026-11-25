export function mapList<T, U>(values: readonly T[], label: string, map: (value: T, index: number) => U): U[] {
    if (!Array.isArray(values)) throw Error(`${label} must be an array`);
    const length = values.length;
    const result: U[] = [];
    for (let i = 0; i < length; i++) {
        if (!Object.hasOwn(values, i)) throw Error(`${label} missing own slot ${i}`);
        result.push(map(values[i], i));
    }
    return result;
}
