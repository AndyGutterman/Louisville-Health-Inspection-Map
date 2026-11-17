// Table View's sort: by date, score or name. Picking the column already sorted reverses it.
import { useState } from "react";

export function useTableSort() {
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
    sortAxis === "date" ? (sortDir === "desc" ? "Newest ↓" : "Oldest ↑") : "Newest ↓";
  const scoreSortLabel =
    sortAxis === "score" ? (sortDir === "asc" ? "Lowest ↑" : "Highest ↓") : "Lowest ↑";

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
