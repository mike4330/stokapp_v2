/**
 * Color utilities for generating color scales
 * Based on the matplotlib viridis color palette
 */

/**
 * Viridis color stops representing the palette at different points
 */
const VIRIDIS_COLORS = [
  { value: 0, color: [68, 1, 84] },    // Dark purple
  { value: 0.2, color: [72, 40, 120] }, // Purple
  { value: 0.4, color: [62, 83, 160] }, // Blue
  { value: 0.6, color: [31, 130, 146] }, // Teal
  { value: 0.8, color: [53, 183, 121] }, // Green
  { value: 1.0, color: [253, 231, 37] }  // Yellow
];

/**
 * Linear interpolation between two values
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Interpolate between two RGB colors
 */
function interpolateColor(color1: number[], color2: number[], t: number): number[] {
  return [
    Math.round(lerp(color1[0], color2[0], t)),
    Math.round(lerp(color1[1], color2[1], t)),
    Math.round(lerp(color1[2], color2[2], t)),
  ];
}

/**
 * Get a color from the viridis palette based on a normalized value (0-1)
 */
function getViridisColor(normalizedValue: number): number[] {
  // Find the color stops that the value falls between
  for (let i = 0; i < VIRIDIS_COLORS.length - 1; i++) {
    if (normalizedValue >= VIRIDIS_COLORS[i].value && normalizedValue <= VIRIDIS_COLORS[i + 1].value) {
      const t = (normalizedValue - VIRIDIS_COLORS[i].value) / 
                (VIRIDIS_COLORS[i + 1].value - VIRIDIS_COLORS[i].value);
      return interpolateColor(VIRIDIS_COLORS[i].color, VIRIDIS_COLORS[i + 1].color, t);
    }
  }
  
  // Fallback to the last color if value is out of range
  return VIRIDIS_COLORS[VIRIDIS_COLORS.length - 1].color;
}

/**
 * Calculate the contrast ratio with white text
 * Returns true if white text has good contrast, false if black would be better
 */
function hasGoodContrastWithWhite(r: number, g: number, b: number): boolean {
  // Calculate relative luminance using the sRGB formula
  const luminance = 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
  
  // Return true if white text would have good contrast (darker backgrounds)
  return luminance < 0.5;
}

/**
 * Get a dynamic color for a dividend amount based on the current max amount
 * @param amount The dividend amount to get a color for
 * @param minAmount The minimum amount to start the color scale (default: 1)
 * @param maxAmount The maximum amount for the color scale (default: 100)
 * @returns An object with the background color and text color
 */
export function getDividendColor(amount: number, minAmount = 1, maxAmount = 100): { 
  background: string, 
  text: string 
} {
  // Special case for zero
  if (amount === 0) {
    return { background: '#1c1c1c', text: 'white' };
  }
  
  // Special case for very low values (below minAmount)
  if (amount < minAmount) {
    return { background: '#f3f4f6', text: 'black' }; // Light gray
  }
  
  // Cap at maxAmount and normalize
  const normalizedValue = Math.min(amount, maxAmount) / maxAmount;
  
  // Get the RGB color from viridis palette
  const rgb = getViridisColor(normalizedValue);
  
  // Determine text color for contrast
  const textColor = hasGoodContrastWithWhite(rgb[0], rgb[1], rgb[2]) ? 'white' : 'black';
  
  // Return the background color as RGB and appropriate text color
  return {
    background: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
    text: textColor
  };
}

/**
 * Generate CSS style object for a dividend amount
 * Uses the viridis color palette with dynamic scaling
 * @param amount The dividend amount
 * @param minAmount The minimum amount for the scale (default: 1)
 * @param maxAmount The maximum amount for the scale (default: 100)
 * @returns A style object with background and text color
 */
export function getDividendStyle(amount: number, minAmount = 1, maxAmount = 100): {
  backgroundColor: string,
  color: string
} {
  const { background, text } = getDividendColor(amount, minAmount, maxAmount);
  
  return {
    backgroundColor: background,
    color: text
  };
}

/**
 * Generate color stops for a legend based on the current maximum amount
 * @param maxAmount The maximum amount to generate color stops for
 * @param steps Number of color stops to generate (default: 10)
 * @returns Array of color stop objects with value and color
 */
export function generateColorStops(maxAmount: number, steps = 10): Array<{
  value: number,
  color: string,
  text: string
}> {
  const stops = [];
  
  for (let i = 0; i < steps; i++) {
    const value = (i + 1) * (maxAmount / steps);
    const { background, text } = getDividendColor(value, 1, maxAmount);
    
    stops.push({
      value,
      color: background,
      text
    });
  }
  
  return stops;
}

/**
 * Get Tailwind CSS classes for a dividend amount
 * Note: This won't work directly with the dynamic color system, as Tailwind
 * requires classes to be pre-defined. This is kept for compatibility.
 */
export function getDividendColorClasses(amount: number): string {
  const { text } = getDividendColor(amount);
  
  // We can only use the text color class from Tailwind since the background
  // color is dynamically generated
  return `${text === 'white' ? 'text-white' : 'text-black'} dividend-color-dynamic`;
}