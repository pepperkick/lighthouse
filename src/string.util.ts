/**
 * Render a string by filling templates with values
 * 
 * Example: 
 *  params
 *   str: tf2-{{ name }}
 *   data: { "name": "test" }
 *  return
 *   tf2-test
 * 
 * @param str String to do rendering in
 * @param data Data to use while rendering
 */
export function renderString(str: string, data = {}): string {
	for (const key in data)
		if (data.hasOwnProperty(key))
			str = str.replace(new RegExp(`{{ ${key} }}`, "g"), data[key]);

	return str;
}