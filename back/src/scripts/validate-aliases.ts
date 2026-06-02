import { allDamascusLandmarks } from "../data/damascusLandmarks";
import { buildLandmarkAliases } from "../nlp/landmarkAliases";

const MIN_ALIAS_COUNT = 2;

function needsMultipleArabicAliases(name: string) {
  if (!/[\u0600-\u06FF]/.test(name)) {
    return false;
  }

  return name.trim().split(/\s+/).length > 1;
}

const gaps = allDamascusLandmarks
  .map((landmark) => ({
    landmark,
    searchableAliases: buildLandmarkAliases(landmark),
  }))
  .filter(({ landmark, searchableAliases }) =>
    needsMultipleArabicAliases(landmark.nameAr) && searchableAliases.length < MIN_ALIAS_COUNT,
  );

if (gaps.length === 0) {
  console.log("All landmarks have at least", MIN_ALIAS_COUNT, "searchable aliases.");
  process.exit(0);
}

console.log(`Found ${gaps.length} landmarks with fewer than ${MIN_ALIAS_COUNT} searchable aliases:`);
for (const { landmark, searchableAliases } of gaps) {
  console.log(
    `- ${landmark.id} | ${landmark.nameAr} | rawAliases=${landmark.aliases.length} | searchableAliases=${searchableAliases.length}`,
  );
}

process.exit(1);
