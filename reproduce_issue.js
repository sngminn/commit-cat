import { getVisualWidth, wrapText, boxMessage } from "./src/utils.js";
import process from "node:process";

const text = "한글 테스트입니다. English test.";
console.log(`Width of '한': ${getVisualWidth("한")}`);
console.log(`Width of 'A': ${getVisualWidth("A")}`);

const longText =
  "이것은 매우 긴 한글 텍스트입니다. 줄바꿈이 제대로 되는지 확인하기 위함입니다. abcd efgh ijkl mnop qrst uvwx yz. 1234 5678.";
console.log("--- Wrapped Text (Limit 20) ---");
console.log(wrapText(longText, 20, { stdout: { columns: 100 } }));

console.log("\n--- Box Message Test ---");
console.log(
  boxMessage("  테스트 타이틀  ", longText, { stdout: { columns: 60 } })
);
