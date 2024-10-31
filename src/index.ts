interface ComplexCalculationParams {
    baseValue: number;
    multiplier: number;
    angle: number;
    power: number;
  }
  
  /**
   * Realiza um cálculo complexo combinando trigonometria, exponenciais e logaritmos
   * @param params Parâmetros para o cálculo
   * @returns Resultado do cálculo complexo
   * @throws Error se os parâmetros forem inválidos
   */
  export function performComplexCalculation(params: ComplexCalculationParams): number {
    const { baseValue, multiplier, angle, power } = params;
  
    // Validações
    if (baseValue <= 0 || multiplier <= 0) {
      throw new Error('Base value and multiplier must be positive numbers');
    }
  
    // Cálculo complexo combinando várias operações matemáticas
    const trigonometricComponent = Math.sin(angle) * Math.cos(angle);
    const exponentialComponent = Math.exp(power / 10);
    const logarithmicComponent = Math.log(baseValue * multiplier);
  
    const result = (trigonometricComponent * exponentialComponent + logarithmicComponent) * 
                   Math.sqrt(baseValue) * multiplier;
  
    return Number(result.toFixed(4));
  }
  
  // Função auxiliar para converter graus em radianos
  export function degreesToRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
  
  // Exemplo de uso:
  const exampleParams: ComplexCalculationParams = {
    baseValue: 10,
    multiplier: 2,
    angle: degreesToRadians(45), // 45 graus em radianos
    power: 2
  };
  
  const result = performComplexCalculation(exampleParams);
  console.log(`Resultado do cálculo: ${result}`);