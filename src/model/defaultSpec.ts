import { SPEC_VERSION, type MemoSpec } from "./memoSpec";
import { builtInProfiles, profileToSnapshot, type LetterheadProfile } from "./profiles";

export const DEFAULT_ACKNOWLEDGMENT =
  "I have received and understand this counseling.  I had the opportunity to ask questions and discuss the plan of action.";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

export function formatMemoDate(date: Date = new Date()): string {
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

export function createDefaultSpec(
  profile: LetterheadProfile = builtInProfiles[0]
): MemoSpec {
  return {
    specVersion: SPEC_VERSION,
    type: "memo",
    profileId: profile.id,
    letterhead: profileToSnapshot(profile),
    officeSymbol: profile.defaultOfficeSymbol,
    arimsRecordNumber: "",
    date: formatMemoDate(),
    suspense: null,
    subject: "",
    addressees: [""],
    thru: [],
    font: profile.defaultFont,
    fontSizePt: 12,
    paragraphs: [{ text: "", children: [] }],
    authorityLine: null,
    signature: {
      name: "",
      rankBranch: "",
      title: [""],
      civilian: false
    },
    enclosures: [],
    cfRecipients: [],
    distribution: [],
    acknowledgment: null
  };
}
