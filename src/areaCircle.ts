import { PI } from './constants/pi';

/**
 * Calculates the area of a circle
 * @param radius - Radius of the circle
 * @returns Area of the circle
 */
export function calculateCircleArea(radius: number): number {
    return PI * radius * radius;
}