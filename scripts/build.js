// Notion 데이터베이스 -> 정적 HTML 대시보드 빌드 스크립트
// 이 스크립트는 GitHub Actions(서버) 환경에서 실행되므로 CORS 제약이 없습니다.

const { Client } = require("@notionhq/client");
const fs = require("fs");
const path = require("path");

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

if (!NOTION_TOKEN || !DATABASE_ID) {
  console.error("NOTION_TOKEN, NOTION_DATABASE_ID 환경변수가 필요합니다.");
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });

// Notion property 타입별로 사람이 읽을 수 있는 값으로 변환
function extractPropertyValue(prop) {
  switch (prop.type) {
    case "title":
      return prop.title.map((t) => t.plain_text).join("");
    case "rich_text":
      return prop.rich_text.map((t) => t.plain_text).join("");
    case "number":
      return prop.number;
    case "select":
      return prop.select ? prop.select.name : null;
    case "multi_select":
      return prop.multi_select.map((s) => s.name);
    case "status":
      return prop.status ? prop.status.name : null;
    case "date":
      return prop.date ? prop.date.start : null;
    case "checkbox":
      return prop.checkbox;
    case "url":
      return prop.url;
    case "email":
      return prop.email;
    case "people":
      return prop.people.map((p) => p.name || p.id);
    case "created_time":
      return prop.created_time;
    case "last_edited_time":
      return prop.last_edited_time;
    case "formula":
      return extractPropertyValue({ type: prop.formula.type, [prop.formula.type]: prop.formula[prop.formula.type] });
    case "rollup":
      if (prop.rollup.type === "number") return prop.rollup.number;
      if (prop.rollup.type === "array") return prop.rollup.array.length;
      return null;
    case "relation":
      // 노션 API는 relation에 대해 연결된 페이지의 ID만 주고 제목은 안 줍니다.
      // 일단 ID만 담아두고, 아래 resolveRelations()에서 실제 제목으로 치환합니다.
      return { __relation: true, ids: prop.relation.map((r) => r.id) };
    default:
      return null;
  }
}

async function fetchAllRows() {
  let rows = [];
  let titleColKey = null;
  let cursor = undefined;

  do {
    const response = await notion.databases.query({
      database_id: DATABASE_ID,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const page of response.results) {
      const row = { id: page.id };
      for (const [key, prop] of Object.entries(page.properties)) {
        row[key] = extractPropertyValue(prop);
        if (prop.type === "title" && !titleColKey) titleColKey = key;
      }
      rows.push(row);
    }

    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return { rows, titleColKey };
}

// relation 속성 안의 페이지 ID들을 실제 제목 텍스트로 바꿔줍니다.
async function resolveRelations(rows) {
  const idsToResolve = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      const val = row[key];
      if (val && typeof val === "object" && val.__relation) {
        val.ids.forEach((id) => idsToResolve.add(id));
      }
    }
  }

  if (idsToResolve.size === 0) return;

  console.log(`관계형 속성 ${idsToResolve.size}건의 제목을 조회 중...`);
  const titleCache = new Map();

  for (const id of idsToResolve) {
    try {
      const page = await notion.pages.retrieve({ page_id: id });
      const titleProp = Object.values(page.properties).find((p) => p.type === "title");
      const title = titleProp ? titleProp.title.map((t) => t.plain_text).join("") : "(제목 없음)";
      titleCache.set(id, title || "(제목 없음)");
    } catch (err) {
      titleCache.set(id, "(접근 불가)");
    }
  }

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      const val = row[key];
      if (val && typeof val === "object" && val.__relation) {
        row[key] = val.ids.map((id) => titleCache.get(id)).join(", ");
      }
    }
  }
}

// 컬럼들을 타입별로 분류 (숫자 / 날짜 / 카테고리형 텍스트)
function classifyColumns(rows) {
  if (rows.length === 0) return { numberCols: [], dateCols: [], categoryCols: [] };

  const sample = rows[0];
  const numberCols = [];
  const dateCols = [];
  const categoryCols = [];

  for (const key of Object.keys(sample)) {
    if (key === "id") continue;
    const values = rows.map((r) => r[key]).filter((v) => v !== null && v !== undefined);
    if (values.length === 0) continue;

    const allNumbers = values.every((v) => typeof v === "number");
    const allDateStrings = values.every((v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v));
    const isShortText = values.every((v) => typeof v === "string" && v.length <= 30);

    if (allNumbers) numberCols.push(key);
    else if (allDateStrings) dateCols.push(key);
    else if (isShortText) {
      const uniqueRatio = new Set(values).size / values.length;
      if (uniqueRatio <= 0.6) categoryCols.push(key); // 값이 반복되면 카테고리로 간주
    }
  }

  return { numberCols, dateCols, categoryCols };
}

function buildHtml(rows, meta, titleColKey) {
  const { numberCols, dateCols, categoryCols } = meta;
  const generatedAt = new Date().toISOString();

  const template = fs.readFileSync(path.join(__dirname, "template.html"), "utf-8");

  const html = template
    .replace("__DATA__", JSON.stringify(rows))
    .replace("__NUMBER_COLS__", JSON.stringify(numberCols))
    .replace("__DATE_COLS__", JSON.stringify(dateCols))
    .replace("__CATEGORY_COLS__", JSON.stringify(categoryCols))
    .replace("__TITLE_COL__", JSON.stringify(titleColKey || ""))
    .replace("__GENERATED_AT__", generatedAt);

  return html;
}

async function main() {
  console.log("Notion 데이터베이스 조회 중...");
  const { rows, titleColKey } = await fetchAllRows();
  console.log(`총 ${rows.length}개 행을 가져왔습니다.`);

  await resolveRelations(rows);

  const meta = classifyColumns(rows);
  console.log("컬럼 분류:", meta);

  const html = buildHtml(rows, meta, titleColKey);

  const outDir = path.join(__dirname, "..", "public");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "index.html"), html, "utf-8");
  fs.writeFileSync(path.join(outDir, "data.json"), JSON.stringify(rows, null, 2), "utf-8");

  console.log("public/index.html 생성 완료");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
