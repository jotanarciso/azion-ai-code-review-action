/**
 * Constante PI para cálculos circulares
 */
const PI = 3.14159265359;

/**
 * Calcula a área de um quadrado
 * @param side - Comprimento do lado do quadrado
 * @returns Área do quadrado
 */
export function calculateSquareArea(side: number): number {
    return side * side;
}

/**
 * Calcula a área de um retângulo
 * @param width - Largura do retângulo
 * @param height - Altura do retângulo
 * @returns Área do retângulo
 */
export function calculateRectangleArea(width: number, height: number): number {
    return width * height;
}

/**
 * Calcula a área de um triângulo
 * @param base - Base do triângulo
 * @param height - Altura do triângulo
 * @returns Área do triângulo
 */
export function calculateTriangleArea(base: number, height: number): number {
    return (base * height) / 2;
}

/**
 * Calcula a área de um círculo
 * @param radius - Raio do círculo
 * @returns Área do círculo
 */
export function calculateCircleArea(radius: number): number {
    return PI * radius * radius;
}