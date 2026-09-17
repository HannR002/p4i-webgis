export interface AHPResult {
  weights: {
    bencana: number;
    kesuburan: number;
    kepadatan: number;
  };
  cr: number;
  isValid: boolean;
}

/**
 * Menghitung Bobot Prioritas (Eigenvector) dan Consistency Ratio (CR) dari Matriks AHP 3x3.
 * Matriks Indexing:
 * 0: Kriteria Bencana
 * 1: Kriteria Kesuburan
 * 2: Kriteria Kepadatan
 */
export function calculateAHP(matrix: number[][]): AHPResult {
  const n = matrix.length; // n harus 3

  // 1. Hitung total jumlah per kolom
  const colSums = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      colSums[i] += matrix[j][i];
    }
  }

  // 2. Normalisasi Matriks & Hitung Vektor Bobot Prioritas (Eigenvector)
  const weights = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    let rowSum = 0;
    for (let j = 0; j < n; j++) {
      rowSum += matrix[i][j] / colSums[j];
    }
    weights[i] = rowSum / n;
  }

  // 3. Menghitung Eigenvalue Maksimum (Lambda Max)
  // Kalikan matriks awal dengan vektor bobot
  let lambdaMax = 0;
  for (let i = 0; i < n; i++) {
    let rowProdSum = 0;
    for (let j = 0; j < n; j++) {
      rowProdSum += matrix[i][j] * weights[j];
    }
    // Lambda_i = Hasil kali baris / Bobot kriteria
    lambdaMax += (rowProdSum / weights[i]);
  }
  lambdaMax = lambdaMax / n;

  // 4. Menghitung Consistency Index (CI)
  const CI = (lambdaMax - n) / (n - 1);

  // 5. Menghitung Consistency Ratio (CR) menggunakan Random Index (RI) untuk n=3 (Saaty)
  const RI = 0.58; 
  const CR = CI / RI;

  return {
    weights: {
      bencana: weights[0],
      kesuburan: weights[1],
      kepadatan: weights[2],
    },
    cr: isNaN(CR) ? 0 : CR, // Tangani jika terjadi pembagian nol absolut
    isValid: isNaN(CR) ? true : (CR <= 0.1), // Standar akademis CR <= 10%
  };
}
