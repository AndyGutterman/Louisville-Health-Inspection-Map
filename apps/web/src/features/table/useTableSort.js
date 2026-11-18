// Table View's sort: by date, score or name. Picking the column already sorted reverses it.
import { useState } from "react";
import { useT } from "../../I18nContext.jsx";

export function useTableSort() {
  const { t } = useT();
  // axis = "date" | "score" | "name", dir = "desc" | "asc"
  const [sortAxis, setSortAxis] = useState("date");
  const [sortDir, setSortDir] = useState("desc");

  const handleDateSort = () => {
    if (sortAxis !== "date") {
      setSortAxis("date");
      setSortDir("desc");
    } else setSortDir((d) => (d === "desc" ? "asc" : "desc"));
  };
  const handleScoreSort = () => {
    if (sortAxis !== "score") {
      setSortAxis("score");
      setSortDir("asc");
    } else setSortDir((d) => (d === "asc" ? "desc" : "asc"));
  };
  const handleNameSort = () => {
    if (sortAxis !== "name") {
      setSortAxis("name");
      setSortDir("asc");
    } else setSortDir((d) => (d === "asc" ? "desc" : "asc"));
  };

  // Label always same width — use fixed strings with arrow suffix
  const dateSortLabel =
    sortAxis === "date"
      ? sortDir === "desc"
        ? t("table.newest")
        : t("table.oldest")
      : t("table.newest");
  const scoreSortLabel =
    sortAxis === "score"
      ? sortDir === "asc"
        ? t("table.lowest")
        : t("table.highest")
      : t("table.lowest");

  return {
    sortAxis,
    sortDir,
    handleDateSort,
    handleScoreSort,
    handleNameSort,
    dateSortLabel,
    scoreSortLabel,
  };
}
