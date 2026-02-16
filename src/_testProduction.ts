//import { getPendingInstruments } from "@/production";
import { getPendingInstruments } from "@/production/rules";

const result = getPendingInstruments(
  {
    instruments: ["VOZ", "TUBA"],
    musiciansDone: { VOZ: true }
  },
  "musicians"
);

console.log(result);
