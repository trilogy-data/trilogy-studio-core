

/**
 * Transforms a snake_case string to capitalized words with spaces
 * @param snakeCase - The snake_case string to transform
 * @returns The transformed string with capitalized words separated by spaces
 * 
 * @example
 * // Returns "X Yz Def"
 * snakeCaseToCapitalizedWords("x_yz_def")
 */
export function snakeCaseToCapitalizedWords(snakeCase: string | undefined): string {
    if (!snakeCase) return '';
    // Split the string by underscores
    const words = snakeCase.split('_');
    
    // Capitalize the first letter of each word
    const capitalizedWords = words.map(word => {
      if (word.length === 0) return '';
      return word.charAt(0).toUpperCase() + word.slice(1);
    });
    
    // Join the words with spaces
    return capitalizedWords.join(' ');
  }