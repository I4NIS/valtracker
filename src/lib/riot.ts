import { t } from "./i18n";

export const GRADES = ["distinction", "merit", "pass"] as const;

export function gradeLabel(grade: string): string {
  switch (grade) {
    case "distinction":
      return "Distinction";
    case "merit":
      return t("Mérite", "Merit");
    case "pass":
      return t("Validé", "Pass");
    default:
      return grade.charAt(0).toUpperCase() + grade.slice(1).replace(/_/g, " ");
  }
}

export function gradeTone(grade: string | null | undefined): string {
  if (grade === "distinction") return "gold";
  if (grade === "merit") return "good";
  return "muted";
}

const TRENDS: Record<string, number> = { double_down: -2, down: -1, neutral: 0, up: 1, double_up: 2 };

export function trendLevel(trend: string): number | null {
  return trend in TRENDS ? TRENDS[trend] : null;
}

export function trendLabel(trend: string): string {
  switch (trend) {
    case "double_up":
      return t("double flèche vers le haut", "double up arrow");
    case "up":
      return t("flèche vers le haut", "up arrow");
    case "neutral":
      return t("stable", "neutral");
    case "down":
      return t("flèche vers le bas", "down arrow");
    case "double_down":
      return t("double flèche vers le bas", "double down arrow");
    default:
      return trend;
  }
}

export function notAvailable(): string {
  return t("Non disponible pour les matchs synchronisés avant la version 1.0", "Not available for matches synced before version 1.0");
}
