"use client";

import { FormEvent, useEffect, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { BackHomeLink } from "@/components/ui/BackHomeLink";
import { Button } from "@/components/ui/Button";
import { ReviewPendingState } from "@/components/verification/ReviewPendingState";
import {
  readDraft,
  removeDraft,
  writeDraft,
} from "@/lib/drafts";
import {
  ApiError,
  apiFetch,
  cachedApiFetch,
  cancelPendingUpload,
  clearClientCache,
  clearPendingUploads,
  clearSession,
  getPendingUpload,
  getPendingUploads,
  getCurrentUser,
  isUnauthorizedError,
  normalizeAccountStatus,
  normalizePageStatus,
  primeCurrentUserCache,
  unwrapData,
  uploadDocument,
  type AccountStatus,
  type PageStatus,
  type PendingUpload,
} from "@/lib/api";

type StudentProfile = {
  displayName?: string;
  shortBio?: string;
  longBio?: string | null;
  schoolOfStudy?: string;
  courseOfStudy?: string;
  level?: string;
  profilePicture?: string;
  proofOfStudentship?: string;
  dateOfBirth?: string;
  gender?: string;
  phoneNumber?: string;
  emergencyContact?: string;
  socialLinks?: Record<string, string>;
  status?: string;
  rejectionReason?: string;
  reason?: string;
};

type User = {
  id?: string;
  email?: string;
  displayName?: string;
  studentProfileStatus?: unknown;
  role?: string;
};

type FormState = Omit<
  StudentProfile,
  "status" | "rejectionReason" | "reason" | "socialLinks"
> & {
  linkedin: string;
  website: string;
};

type ProfileDraft = {
  form: FormState;
  step: number;
};

type UploadAccordionProps = {
  title: string;
  description: string;
  accept: string;
  format: string;
  value?: string;
  uploading: boolean;
  required?: boolean;
  onUpload: (file: File) => void;
};

function UploadAccordion({
  title,
  description,
  accept,
  format,
  value,
  uploading,
  required = false,
  onUpload,
}: UploadAccordionProps) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);

    const file = event.dataTransfer.files[0];

    if (file) {
      onUpload(file);
    }
  };

  return (
    <details className="group min-w-0 rounded-[10px] border border-black/10 bg-[#FAFBF9] p-3 sm:p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-safecrib-black [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm ${
              value
                ? "bg-[#EAF7F1] text-safecrib-green"
                : "bg-black/[0.05] text-black/55"
            }`}
          >
            {value ? "✓" : "↑"}
          </span>

          <span className="min-w-0">
            <span className="block break-words text-sm font-medium">
              {title}
              {required ? " *" : ""}
            </span>

            <span className="mt-1 block text-xs font-normal leading-5 text-black/55">
              {value ? "Uploaded and ready" : description}
            </span>
          </span>
        </span>

        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/10 text-lg text-black/50 transition-transform group-open:rotate-45"
          aria-hidden="true"
        >
          +
        </span>
      </summary>

      <div className="pt-4">
        <label
          className={`flex cursor-pointer flex-col items-center justify-center rounded-[8px] border border-dashed px-5 py-7 text-center transition-colors ${
            dragging
              ? "border-safecrib-green bg-[#EAF7F1]"
              : "border-black/20 bg-white hover:border-safecrib-green hover:bg-[#F3FAF6]"
          } ${uploading ? "pointer-events-none opacity-60" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#EAF7F1] text-xl text-safecrib-green">
            ↑
          </span>

          <span className="mt-3 max-w-full break-words text-sm font-medium text-safecrib-black">
            {uploading
              ? "Uploading..."
              : value
                ? "Choose a different file"
                : "Drop your file here or browse"}
          </span>

          <span className="mt-1 max-w-full break-words text-xs leading-5 text-black/50">
            {format}
          </span>

          <input
            required={required && !value}
            type="file"
            accept={accept}
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                onUpload(file);
              }
            }}
            className="sr-only"
          />
        </label>

        {value && (
          <p className="mt-3 flex items-center gap-2 text-xs font-medium text-safecrib-green">
            <span aria-hidden="true">✓</span>
            File uploaded successfully
          </p>
        )}
      </div>
    </details>
  );
}

const FUTMINNA_SCHOOL_NAME = "Federal University of Technology Minna (FUTMINNA)";
const LEVEL_OPTIONS = ["100L", "200L", "300L", "400L", "500L"];
const GENDER_OPTIONS = ["male", "female"];

const futminnaCourses = [
  { name: "IJMB", aliases: ["IJMB", "Interim Joint Matriculation Board", "Matriculation"] },
  { name: "Pre-Degree", aliases: ["PD", "Pre Degree", "Predegree"] },
  { name: "WASCAL CC & HH", aliases: ["WASCAL", "CC", "HH", "Climate Change", "Human Habitat"] },
  { name: "Molecular Biology and Bioinformatics", aliases: ["MBB", "Molecular Biology", "Bioinformatics", "Molecular", "Bioinformatics"] },
  { name: "Toxicology", aliases: ["TOX", "Toxicology", "Toxic"] },
  { name: "Food Safety", aliases: ["FS", "Food", "Safety", "Food Safety"] },
  { name: "Urban Ecology", aliases: ["UE", "Urban", "Ecology", "Urban Ecology"] },
  { name: "Sustainable Urban Development", aliases: ["SUD", "Sustainable", "Urban Development", "Urban"] },
  { name: "Climate Change and Mitigation and Adaptation", aliases: ["CCMA", "Climate Change", "Mitigation", "Adaptation", "Climate"] },
  { name: "Disaster Risk Management and Development Studies", aliases: ["DRMDS", "DRM", "Disaster", "Risk Management", "Development Studies"] },
  { name: "Thermofluids and Power Plant Engineering", aliases: ["TPPE", "Thermofluids", "Power Plant", "Power", "Thermal"] },
  { name: "Design and Solid Mechanics Engineering", aliases: ["DSME", "Solid Mechanics", "Design", "Mechanics"] },
  { name: "Industrial and Production Engineering", aliases: ["IPE", "Industrial Engineering", "Production Engineering", "Industrial", "Production"] },
  { name: "Highway and Transportation Engineering", aliases: ["HTE", "Highway", "Transportation Engineering", "Transport Engineering", "Transportation"] },
  { name: "Water Resources and Environmental Engineering", aliases: ["WREE", "Water Resources", "Environmental Engineering", "Water", "Environment"] },
  { name: "Geotechnical Engineering", aliases: ["GTE", "Geotechnical", "Geotech", "Engineering"] },
  { name: "Structural Engineering", aliases: ["SE", "Structural", "Structures", "Engineering"] },
  { name: "Food Engineering", aliases: ["FE", "Food", "Engineering", "Food Engineering"] },
  { name: "Soil and Water Engineering", aliases: ["SWE", "Soil", "Water", "Soil Water", "Engineering"] },
  { name: "Agricultural Crop Processing and Storage", aliases: ["ACPS", "Agricultural", "Crop Processing", "Crop Storage", "Storage"] },
  { name: "Farm Power and Machinery", aliases: ["FPM", "Farm Power", "Farm Machinery", "Agricultural Machinery", "Machinery"] },
  { name: "Woodwork Technology Education", aliases: ["WTE", "Woodwork", "Wood Technology", "Technology Education", "Wood"] },
  { name: "Metal work Technology Education", aliases: ["MWTE", "Metalwork", "Metal Work", "Technology Education", "Metal"] },
  { name: "Electrical/Electronic Technology Education", aliases: ["ETE", "EET", "Electrical Technology", "Electronic Technology", "Technology Education"] },
  { name: "Building Technology Education", aliases: ["BTE", "Building Technology", "Technology Education", "Building"] },
  { name: "Automobile Technology Education", aliases: ["ATE", "Automobile", "Auto Technology", "Technology Education", "Automotive"] },
  { name: "Applied Atmospheric Physics", aliases: ["AAP", "Atmospheric Physics", "Atmospheric", "Applied Physics"] },
  { name: "Solid State Physics", aliases: ["SSP", "Solid State", "Physics", "Solid State Physics"] },
  { name: "Applied Geophysics", aliases: ["AGP", "Geophysics", "Applied Geophysics", "Geophysical"] },
  { name: "Applied Mathematics", aliases: ["AM", "Applied Math", "Mathematics", "Maths", "Applied Mathematics"] },
  { name: "Environmental Geology", aliases: ["EG", "Environmental", "Geology", "Environmental Geology"] },
  { name: "Biostratigraphy", aliases: ["BIOSTRAT", "Bio", "Stratigraphy", "Biostratigraphy"] },
  { name: "Mineral Exploration", aliases: ["ME", "Mineral", "Exploration", "Mineral Exploration"] },
  { name: "Hydrogeology", aliases: ["HYD", "Hydro", "Geology", "Hydrogeology", "Groundwater"] },
  { name: "Applied Remote Sensing", aliases: ["ARS", "Remote Sensing", "Sensing", "Remote", "Applied"] },
  { name: "Environmental Management", aliases: ["EM", "Environmental", "Management", "Environment"] },
  { name: "Applied Meteorology", aliases: ["AMET", "Meteorology", "Weather", "Applied Meteorology"] },
  { name: "Polymer Science and Technology", aliases: ["PST", "Polymer", "Polymer Science", "Polymer Technology"] },
  { name: "Natural Product Chemistry", aliases: ["NPC", "Natural Products", "Chemistry", "Natural Product"] },
  { name: "Analytical Chemistry", aliases: ["AC", "Analytical", "Chemistry", "Analytical Chemistry"] },
  { name: "Organic Chemistry", aliases: ["OC", "Organic", "Chemistry", "Organic Chemistry"] },
  { name: "Public Health", aliases: ["PH", "Public Health", "Health"] },
  { name: "Pharmaceutical Microbiology", aliases: ["PMB", "Pharma Microbiology", "Pharmaceutical", "Microbiology"] },
  { name: "Environmental Microbiology", aliases: ["EMB", "Environmental", "Microbiology", "Environmental Microbiology"] },
  { name: "Medical Microbiology", aliases: ["MMB", "Medical", "Microbiology", "Medical Microbiology"] },
  { name: "Food and Industrial Microbiology", aliases: ["FIM", "Food Microbiology", "Industrial Microbiology", "Microbiology"] },
  { name: "Mycology", aliases: ["MYC", "Fungi", "Fungal", "Mycology"] },
  { name: "Plant Genetics and Breeding", aliases: ["PGB", "Plant Genetics", "Plant Breeding", "Genetics", "Breeding"] },
  { name: "Applied Hydrobiology", aliases: ["AHB", "Hydrobiology", "Aquatic Biology", "Applied Hydrobiology"] },
  { name: "Applied Entomology and Parasitology", aliases: ["AEP", "Entomology", "Parasitology", "Insects", "Parasites"] },
  { name: "Surveying and Geoinformatics", aliases: ["SG", "SUG", "Surveying", "Geoinformatics", "Survey", "GIS"] },
  { name: "Urban and Regional Planning", aliases: ["URP", "Urban Planning", "Regional Planning", "Town Planning", "Planning"] },
  { name: "Environmental Impact Assessment", aliases: ["EIA", "Environmental Impact", "Impact Assessment", "Environment"] },
  { name: "Housing and Urban Renewal", aliases: ["HUR", "Housing", "Urban Renewal", "Housing Urban"] },
  { name: "Urban Governance and Poverty study", aliases: ["UGPS", "Urban Governance", "Governance", "Poverty", "Urban Poverty"] },
  { name: "Construction Technology", aliases: ["CT", "Construction", "Construction Tech", "Building Construction"] },
  { name: "Construction Management", aliases: ["CM", "Construction", "Management", "Construction Management"] },
  { name: "Communication Engineering", aliases: ["CE", "Communication", "Communications", "Engineering"] },
  { name: "Electrical/ Electronic Engineering (Electronic option)", aliases: ["EEE", "EE", "Electronic Engineering", "Electronics", "Electrical Engineering"] },
  { name: "Electrical/ Electronic Engineering (Power Systems option)", aliases: ["EEE", "EE", "Power Systems", "Electrical Engineering", "Electrical Power"] },
  { name: "Fisheries Technology", aliases: ["FT", "Fisheries", "Fishery", "Fisheries Technology"] },
  { name: "Fish Toxicology", aliases: ["FTX", "Fish", "Toxicology", "Fish Toxicology"] },
  { name: "Fish Ecology", aliases: ["FECO", "Fish", "Ecology", "Fish Ecology"] },
  { name: "Fish Biology", aliases: ["FB", "Fish", "Biology", "Fish Biology"] },
  { name: "Fish Genetics and Breeding", aliases: ["FGB", "Fish Genetics", "Fish Breeding", "Genetics", "Breeding"] },
  { name: "Fish Post Harvest Technology", aliases: ["FPHT", "Fish", "Post Harvest", "Fish Processing", "Harvest"] },
  { name: "Hydrobiology/Limnology", aliases: ["HL", "Hydrobiology", "Limnology", "Aquatic", "Water Biology"] },
  { name: "Aquaculture/Fish Nutrition", aliases: ["AFN", "Aquaculture", "Fish Nutrition", "Fish Farming", "Aquatic"] },
  { name: "Soil Science", aliases: ["SS", "Soil", "Soil Science"] },
  { name: "Soil Conservation and Water Management", aliases: ["SCWM", "Soil Conservation", "Water Management", "Soil", "Water"] },
  { name: "Soil Microbiology", aliases: ["SMB", "Soil", "Microbiology", "Soil Microbiology"] },
  { name: "Soil Physics", aliases: ["SP", "Soil", "Physics", "Soil Physics"] },
  { name: "Soil Fertility", aliases: ["SF", "Soil", "Fertility", "Soil Fertility"] },
  { name: "Pedology", aliases: ["PED", "Soil", "Pedology", "Soil Science"] },
  { name: "Agronomy", aliases: ["AGR", "Agronomy", "Agriculture", "Crop Science"] },
  { name: "Crop Physiology", aliases: ["CP", "Crop", "Physiology", "Crop Physiology"] },
  { name: "Seed Technology", aliases: ["ST", "Seed", "Seed Technology"] },
  { name: "Crop protection(Nematology&Virology)", aliases: ["CPNV", "Crop Protection", "Nematology", "Virology", "Crop"] },
  { name: "Crop Breeding/Genetics", aliases: ["CBG", "Crop Breeding", "Crop Genetics", "Breeding", "Genetics"] },
  { name: "Weed Science", aliases: ["WS", "Weed", "Weed Science"] },
  { name: "Animal Breeding and Genetics", aliases: ["ABG", "Animal Breeding", "Animal Genetics", "Breeding", "Genetics"] },
  { name: "Reproductive Physiology", aliases: ["RP", "Reproduction", "Physiology", "Animal Reproduction"] },
  { name: "Meat Science", aliases: ["MS", "Meat", "Meat Science", "Animal Science"] },
  { name: "Animal Nutrition (Monogastic & Ruminant Animal Nutrition)", aliases: ["AN", "Animal Nutrition", "Ruminant", "Monogastric", "Nutrition"] },
  { name: "Information Science and Media Studies", aliases: ["ISMS", "Information Science", "Media Studies", "Information", "Media"] },
  { name: "Information Technology", aliases: ["IT", "Information Technology", "Information", "Technology"] },
  { name: "Library and Information Science", aliases: ["LIS", "Library Science", "Information Science", "Library", "Information"] },
  { name: "Industrial and Technology Education", aliases: ["ITE", "Industrial Education", "Technology Education", "Industrial Technology"] },
  { name: "Logistics and Transport Management", aliases: ["LTT", "LTM", "Logistics", "Transport", "Transportation", "Logistics Transport"] },
  { name: "Petroleum and Gas Engineering", aliases: ["PGE", "Petroleum Engineering", "Gas Engineering", "Petroleum", "Oil and Gas", "Oil Gas"] },
  { name: "Project Management Technology", aliases: ["PMT", "Project Management", "Management Technology", "Projects"] },
  { name: "Agricultural Economics and Farm Management", aliases: ["AEFM", "Agricultural Economics", "Farm Management", "Agric Economics", "Agriculture"] },
  { name: "Agricultural Extension and Rural Development", aliases: ["AERD", "Agricultural Extension", "Rural Development", "Agric Extension", "Agriculture"] },
  { name: "Animal Biology", aliases: ["AB", "Animal", "Biology", "Animal Biology"] },
  { name: "Plant Biology", aliases: ["PB", "Plant", "Biology", "Plant Biology"] },
  { name: "Geophysics", aliases: ["GPH", "Geo Physics", "Geophysical", "Geophysics"] },
  { name: "Telecommunication Engineering", aliases: ["TME", "Telecom", "Telecommunications", "Telecommunication", "Engineering"] },
  { name: "Education Technology", aliases: ["EDT", "Educational Technology", "Education", "Technology"] },
  { name: "Quantity Surveying", aliases: ["QS", "QTS", "Quantity Survey", "Quantity Surveying"] },
  { name: "Water Resources and Fiheries Technology", aliases: ["WRFT", "Water Resources", "Fisheries Technology", "Water", "Fisheries"] },
  { name: "Survey and Geoinformatics", aliases: ["SG", "SUG", "Survey", "Surveying", "Geoinformatics", "GIS"] },
  { name: "Physics", aliases: ["PHY", "Physics"] },
  { name: "Soil and Land Management", aliases: ["SLM", "Soil Management", "Land Management", "Soil", "Land"] },
  { name: "Material and Metalurgical Engineering", aliases: ["MME", "Materials Engineering", "Metallurgical Engineering", "Materials", "Metallurgy"] },
  { name: "Mechanical Engineering", aliases: ["ME", "Mechanical", "Mechanical Engineering"] },
  { name: "Mechatronics Engineering", aliases: ["MCE", "Mechatronics", "Mechanical Electronics", "Engineering"] },
  { name: "Microbiology", aliases: ["MCB", "Microbiology", "Microbe", "Microbes"] },
  { name: "Statistics", aliases: ["STA", "Stats", "Statistics"] },
  { name: "Mathematics", aliases: ["MTH", "MAT", "Math", "Maths", "Mathematics"] },
  { name: "Information & Media Technology", aliases: ["IMT", "Information Technology", "Media Technology", "Information", "Media"] },
  { name: "Horticulture", aliases: ["HRT", "Horticulture", "Horticultural", "Plants", "Crop"] },
  { name: "Geography", aliases: ["GEO", "Geography", "Geographical"] },
  { name: "Geology", aliases: ["GEY", "GEOLOGY", "Geology", "Earth Science"] },
  { name: "Food Science Technology", aliases: ["FST", "Food Science", "Food Technology", "Food"] },
  { name: "Estate Management & Valuation", aliases: ["EMV", "Estate Management", "Estate", "Valuation", "Property"] },
  { name: "Electrical/Electronics Engineering", aliases: ["EEE", "EE", "Electrical Engineering", "Electronics", "Electrical Electronics"] },
  { name: "Education Physics", aliases: ["EPHY", "Physics Education", "Education Physics", "Physics", "Education"] },
  { name: "Education Mathematics", aliases: ["EMATH", "Mathematics Education", "Education Mathematics", "Math Education", "Mathematics"] },
  { name: "Education Geography", aliases: ["EGEO", "Geography Education", "Education Geography", "Geography", "Education"] },
  { name: "Education Chemistry", aliases: ["ECHM", "Chemistry Education", "Education Chemistry", "Chemistry", "Education"] },
  { name: "Education Biology", aliases: ["EBIO", "Biology Education", "Education Biology", "Biology", "Education"] },
  { name: "Entrepreneurship & Business Studies", aliases: ["EBS", "Entrepreneurship", "Business Studies", "Business", "Enterprise"] },
  { name: "Cyber Security Science", aliases: ["CSS", "CYS", "Cyber Security", "Cybersecurity", "Cyber", "Security"] },
  { name: "Crop Production", aliases: ["CP", "Crop", "Crop Production", "Agriculture", "Farming"] },
  { name: "Computer Science", aliases: ["CS", "CSC", "Computer", "Computing", "Computer Science"] },
  { name: "Civil Engineering", aliases: ["CE", "Civil", "Civil Engineering"] },
  { name: "Chemistry", aliases: ["CHM", "Chemistry", "Chemical Science"] },
  { name: "Chemical Engineering", aliases: ["CHE", "CHEG", "Chemical", "Chemical Engineering"] },
  { name: "Biological Sciences", aliases: ["BIO", "Biological Science", "Biology", "Biological Sciences"] },
  { name: "Building Technology", aliases: ["BT", "BTech", "Building", "Building Technology"] },
  { name: "Biochemistry", aliases: ["BCH", "Biochem", "Biochemistry"] },
  { name: "Animal Production", aliases: ["AP", "Animal", "Animal Production", "Livestock", "Animal Science"] },
  { name: "Agricultural Economics & Extension Technology", aliases: ["AEET", "Agricultural Economics", "Agricultural Extension", "Extension Technology", "Agriculture"] },
  { name: "Agricultural & Bioresources Engineering", aliases: ["ABE", "ABEN", "Agricultural Engineering", "Bioresources Engineering", "Agric Engineering", "Agriculture"] },
  { name: "Architecture", aliases: ["ARC", "ARCH", "Architecture", "Architectural"] },
] as const;

const emptyForm: FormState = {
  displayName: "",
  shortBio: "",
  longBio: "",
  schoolOfStudy: FUTMINNA_SCHOOL_NAME,
  courseOfStudy: "",
  level: "",
  profilePicture: "",
  proofOfStudentship: "",
  dateOfBirth: "",
  gender: "",
  phoneNumber: "",
  emergencyContact: "",
  linkedin: "",
  website: "",
};

function normalizeNigerianPhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("234")) {
    digits = digits.slice(3);
  }

  digits = digits.replace(/^0+/, "");
  digits = digits.slice(0, 10);

  return digits ? `+234${digits}` : "";
}

function isValidNigerianPhone(value: string) {
  return /^\+234\d{10}$/.test(value.trim());
}

function isValidUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return true;

  try {
    const url = new URL(trimmed);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function hasRequiredStudentDetails(form: FormState) {
  const displayName = String(form.displayName ?? "").trim();
  const schoolOfStudy = String(form.schoolOfStudy ?? "").trim();
  const courseOfStudy = String(form.courseOfStudy ?? "").trim();
  const level = String(form.level ?? "").trim();
  const shortBio = String(form.shortBio ?? "").trim();

  return Boolean(
    displayName &&
      schoolOfStudy &&
      courseOfStudy &&
      level &&
      shortBio.length > 0 &&
      shortBio.length <= 160 &&
      String(form.longBio ?? "").length <= 2000
  );
}

function hasRequiredUploads(form: FormState) {
  const proofOfStudentship =
    form.proofOfStudentship ||
    getPendingUpload("PROOF_OF_STUDENTSHIP") ||
    "";

  const profilePicture =
    form.profilePicture ||
    getPendingUpload("AVATAR") ||
    "";

  return Boolean(
    proofOfStudentship &&
      profilePicture
  );
}

function validateStep(
  stepNumber: number,
  formState: FormState
) {
  const schoolOfStudy = String(formState.schoolOfStudy ?? "").trim();
  const courseOfStudy = String(formState.courseOfStudy ?? "").trim();
  const level = String(formState.level ?? "").trim();

  if (stepNumber === 1) {
    if (!String(formState.shortBio ?? "").trim()) {
      return "Add a short bio so other people can learn about you.";
    }

    if (String(formState.shortBio ?? "").trim().length > 160) {
      return "Your short bio must be 160 characters or fewer.";
    }

    if (String(formState.longBio ?? "").length > 2000) {
      return "Your long bio must be 2,000 characters or fewer.";
    }

    if (!schoolOfStudy || schoolOfStudy !== FUTMINNA_SCHOOL_NAME) {
      return "Select Federal University of Technology Minna (FUTMINNA) as your school.";
    }

    if (!courseOfStudy) {
      return "Select your course of study before continuing.";
    }

    if (!LEVEL_OPTIONS.includes(level)) {
      return "Select your current level before continuing.";
    }

    if (!hasRequiredStudentDetails(formState)) {
      return "Complete the required student details before continuing.";
    }
  }

  if (
    stepNumber === 2 &&
    !hasRequiredUploads(formState)
  ) {
    return "Upload your proof of studentship and profile image before continuing.";
  }

  if (stepNumber === 3) {
    const phoneNumber = String(formState.phoneNumber ?? "").trim();
    const emergencyContact = String(formState.emergencyContact ?? "").trim();
    const dateOfBirth = String(formState.dateOfBirth ?? "").trim();
    const gender = String(formState.gender ?? "").trim().toLowerCase();

    if (!phoneNumber) {
      return "Add your phone number before continuing.";
    }

    if (!isValidNigerianPhone(phoneNumber)) {
      return "Phone number must start with +234 and contain exactly 10 digits after the prefix.";
    }

    if (!emergencyContact) {
      return "Add an emergency contact before continuing.";
    }

    if (!isValidNigerianPhone(emergencyContact)) {
      return "Emergency contact must also start with +234 and contain exactly 10 digits after the prefix.";
    }

    if (phoneNumber === emergencyContact) {
      return "Emergency contact must be different from your normal phone number.";
    }

    if (!dateOfBirth) {
      return "Add your date of birth before continuing.";
    }

    const dob = new Date(dateOfBirth);
    const minDob = new Date("1960-01-01T00:00:00.000Z");
    const maxDob = new Date("2007-12-31T23:59:59.999Z");

    if (Number.isNaN(dob.getTime()) || dob < minDob || dob > maxDob) {
      return "Date of birth must be between 1960 and 2007.";
    }

    if (!GENDER_OPTIONS.includes(gender)) {
      return "Select either male or female for your gender.";
    }
  }

  if (stepNumber === 4) {
    if (formState.linkedin && !isValidUrl(formState.linkedin)) {
      return "LinkedIn link must be a valid URL.";
    }

    if (formState.website && !isValidUrl(formState.website)) {
      return "Website link must be a valid URL.";
    }
  }

  return "";
}

function profileDraftKey(user: User) {
  const owner =
    user.id ??
    user.email ??
    "current";

  return `safecrib:draft:student-profile:v1:${owner}`;
}

export default function CompleteStudentProfilePage() {
  const router = useRouter();

  const [form, setForm] =
    useState<FormState>(emptyForm);

  const [status, setStatus] =
    useState<AccountStatus>("not_submitted");

  const [pageStatus, setPageStatus] =
    useState<PageStatus>("none");

  const [rejectionReason, setRejectionReason] =
    useState("");

  const [error, setError] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  const [uploadingStudentship, setUploadingStudentship] =
    useState(false);

  const [uploadingAvatar, setUploadingAvatar] =
    useState(false);

  const [step, setStep] =
    useState(0);

  const [pendingUploads, setPendingUploads] =
    useState<PendingUpload[]>([]);

  const [cancellingUpload, setCancellingUpload] =
    useState<string | null>(null);

  const [draftKey, setDraftKey] =
    useState<string | null>(null);

  const [draftHydrated, setDraftHydrated] =
    useState(false);

  const [draftRestored, setDraftRestored] =
    useState(false);

  const [courseSearch, setCourseSearch] =
    useState("");

  const [courseSelectionLocked, setCourseSelectionLocked] =
    useState(false);

  useEffect(() => {
    const nextCourseSearch = form.courseOfStudy ?? "";
    setCourseSearch(nextCourseSearch);
    setCourseSelectionLocked(Boolean(nextCourseSearch.trim()));
  }, [form.courseOfStudy]);

  const courseSuggestions =
    courseSearch.trim() === ""
      ? []
      : futminnaCourses
          .filter((course) => {
            const term = courseSearch.trim().toLowerCase();
            return [course.name, ...course.aliases]
              .join(" ")
              .toLowerCase()
              .includes(term);
          })
          .map((course) => course.name)
          .slice(0, 12);

  useEffect(() => {
    if (
      !localStorage.getItem(
        "safecrib_access_token"
      )
    ) {
      router.replace("/login");
      return;
    }

    void Promise.all([
      getCurrentUser<User>(),

      cachedApiFetch<StudentProfile | null>(
        "/api/v1/student-profiles/me"
      ).catch(() => null),

      apiFetch<unknown>(
        "/api/v1/student-profiles/status"
      ).then(unwrapData<unknown>).catch(() => null),

      cachedApiFetch<{ status?: string }>(
        "/api/v1/provider-pages/me"
      ).catch(() => null),
    ])
      .then(
        ([
          user,
          studentProfile,
          statusResponse,
          page,
        ]) => {
          clearClientCache("/api/v1/student-profiles/status");
          primeCurrentUserCache(user);
          const currentDraftKey =
            profileDraftKey(user);

          const draft =
            readDraft<ProfileDraft>(
              currentDraftKey
            );

          const rawStatus =
            statusResponse ?? user.studentProfileStatus;

          setStatus(
            normalizeAccountStatus(rawStatus)
          );

          setPageStatus(
            normalizePageStatus(
              page?.status
            )
          );

          setDraftKey(currentDraftKey);

          setDraftRestored(
            Boolean(draft)
          );

          setDraftHydrated(true);

          if (studentProfile) {
            setForm((current) => ({
              ...current,
              ...studentProfile,

              linkedin:
                studentProfile.socialLinks
                  ?.linkedin ?? "",

              website:
                studentProfile.socialLinks
                  ?.website ?? "",

              ...draft?.form,
            }));

            setRejectionReason(
              studentProfile.rejectionReason ??
                studentProfile.reason ??
                ""
            );
          } else if (draft) {
            setForm(draft.form);
          }

          if (draft) {
            setStep(
              Math.min(
                Math.max(draft.step, 0),
                4
              )
            );
          }
        }
      )
      .catch((loadError: unknown) => {
        if (
          isUnauthorizedError(loadError)
        ) {
          clearSession();
          router.replace(
            "/login?reason=session-expired"
          );

          return;
        }

        setStatus("not_submitted");
        setPageStatus("none");
        setDraftHydrated(true);
      });
  }, [router]);

  useEffect(() => {
    if (draftHydrated && status === "approved") {
      router.replace("/dashboard");
    }
  }, [draftHydrated, router, status]);

  useEffect(() => {
    if (!draftHydrated || status !== "pending") return;

    let checkingStatus = false;
    const refreshStatus = async () => {
      if (checkingStatus || document.visibilityState === "hidden") return;
      checkingStatus = true;
      try {
        const response = unwrapData<unknown>(
          await apiFetch<unknown>("/api/v1/student-profiles/status"),
        );
        const latestStatus = normalizeAccountStatus(response);
        if (latestStatus !== "pending") {
          clearClientCache(
            "/api/v1/student-profiles/status",
            "/api/v1/users/me",
            "/api/v1/auth/me",
          );
          setStatus(latestStatus);
        }
      } catch {
        // Keep the pending state if a temporary status check fails.
      } finally {
        checkingStatus = false;
      }
    };

    window.addEventListener("focus", refreshStatus);
    document.addEventListener("visibilitychange", refreshStatus);
    const interval = window.setInterval(refreshStatus, 30_000);
    return () => {
      window.removeEventListener("focus", refreshStatus);
      document.removeEventListener("visibilitychange", refreshStatus);
      window.clearInterval(interval);
    };
  }, [draftHydrated, status]);

  useEffect(() => {
    if (
      !draftKey ||
      !draftHydrated
    ) {
      return;
    }

    const timeout =
      window.setTimeout(() => {
        writeDraft<ProfileDraft>(
          draftKey,
          {
            form,
            step,
          }
        );
      }, 400);

    return () =>
      window.clearTimeout(timeout);
  }, [
    draftHydrated,
    draftKey,
    form,
    step,
  ]);

  const update = (
    field: keyof FormState,
    value: string
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const uploadStudentship = async (
    file: File
  ) => {
    setUploadingStudentship(true);
    setError("");

    try {
      update(
        "proofOfStudentship",
        await uploadDocument(
          file,
          "PROOF_OF_STUDENTSHIP"
        )
      );
    } catch (uploadError) {
      if (
        uploadError instanceof ApiError &&
        uploadError.status === 429
      ) {
        setPendingUploads(
          await getPendingUploads().catch(
            () => []
          )
        );

        setStep(2);
      }

      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "We could not upload the studentship document."
      );
    } finally {
      setUploadingStudentship(false);
    }
  };

  const uploadAvatar = async (
    file: File
  ) => {
    setUploadingAvatar(true);
    setError("");

    try {
      update(
        "profilePicture",
        await uploadDocument(
          file,
          "AVATAR"
        )
      );
    } catch (uploadError) {
      if (
        uploadError instanceof ApiError &&
        uploadError.status === 429
      ) {
        setPendingUploads(
          await getPendingUploads().catch(
            () => []
          )
        );

        setStep(2);
      }

      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "We could not upload the profile image."
      );
    } finally {
      setUploadingAvatar(false);
    }
  };

  const cancelUpload = async (
    id: string
  ) => {
    setCancellingUpload(id);

    try {
      await cancelPendingUpload(id);

      setPendingUploads(
        (current) =>
          current.filter(
            (upload) =>
              upload.id !== id
          )
      );

      setError(
        "Pending upload cancelled. You can upload the file again."
      );
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : "We could not cancel that pending upload."
      );
    } finally {
      setCancellingUpload(null);
    }
  };

  const submit = async (
    event: FormEvent
  ) => {
    event.preventDefault();

    /*
     * Prevent submitting a profile that is
     * already under review.
     */
    if (status === "pending") {
      setError(
        "Your profile is already under review."
      );
      return;
    }

    if (step !== 4) {
      setError(
        "Complete the final step before submitting your profile for review."
      );
      return;
    }

    const validationError =
      validateStep(1, form) ||
      validateStep(2, form) ||
      validateStep(3, form);

    if (validationError) {
      setError(validationError);

      if (
        !hasRequiredStudentDetails(form)
      ) {
        setStep(1);
      } else if (
        !hasRequiredUploads(form)
      ) {
        setStep(2);
      } else {
        setStep(3);
      }

      return;
    }

    const proofOfStudentship =
      form.proofOfStudentship ||
      getPendingUpload(
        "PROOF_OF_STUDENTSHIP"
      ) ||
      "";

    const profilePicture =
      form.profilePicture ||
      getPendingUpload("AVATAR") ||
      "";

    if (
      !proofOfStudentship ||
      !profilePicture
    ) {
      setStep(2);

      setError(
        "Upload your studentship document and profile image before submitting."
      );

      return;
    }

    setSaving(true);
    setError("");

    try {
      await apiFetch(
        "/api/v1/student-profiles/complete",
        {
          method: "POST",

          body: JSON.stringify({
            displayName:
              form.displayName,

            shortBio: form.shortBio?.trim(),

            ...(form.longBio?.trim()
              ? { longBio: form.longBio.trim() }
              : {}),

            proofOfStudentship,

            schoolOfStudy:
              form.schoolOfStudy,

            courseOfStudy:
              form.courseOfStudy,

            level: form.level,

            profilePicture,

            ...(form.dateOfBirth
              ? {
                  dateOfBirth:
                    form.dateOfBirth,
                }
              : {}),

            ...(form.gender
              ? {
                  gender: form.gender,
                }
              : {}),

            ...(form.phoneNumber
              ? {
                  phoneNumber:
                    form.phoneNumber,
                }
              : {}),

            ...(form.emergencyContact
              ? {
                  emergencyContact:
                    form.emergencyContact,
                }
              : {}),

            ...(form.linkedin.trim() ||
            form.website.trim()
              ? {
                  socialLinks: {
                    linkedin:
                      form.linkedin,
                    website:
                      form.website,
                  },
                }
              : {}),
          }),
        }
      );

      clearClientCache(
        "/api/v1/auth/me",
        "/api/v1/student-profiles/me",
        "/api/v1/student-profiles/status"
      );

      clearPendingUploads();

      if (draftKey) {
        removeDraft(draftKey);
      }

      router.replace("/dashboard");
    } catch {
      setError(
        "We could not submit your profile for review. Check the required fields and try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const openPage = () =>
    router.push(
      pageStatus === "none"
        ? "/page/new"
        : "/page"
    );

  const discardDraft = () => {
    if (draftKey) {
      removeDraft(draftKey);
    }

    setForm(emptyForm);
    setStep(0);
    setDraftRestored(false);
    setError("");
  };

  const input = (
    field: keyof FormState,
    label: string,
    required = false,
    type = "text"
  ) => (
    <label className="block text-sm font-medium text-safecrib-black">
      {label}
      {required ? " *" : ""}

      <input
        required={required}
        type={type}
        value={form[field] ?? ""}
        onChange={(event) =>
          update(
            field,
            event.target.value
          )
        }
        className="mt-2 w-full rounded-[8px] border border-black/15 px-4 py-3 font-normal text-safecrib-black focus:border-safecrib-green focus:outline-none"
      />
    </label>
  );

  const nextStep = () => {
    const validationError =
      validateStep(step, form);

    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");

    setStep((current) =>
      Math.min(current + 1, 4)
    );
  };

  const handleNextClick = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();
    nextStep();
  };

  const previousStep = () => {
    setStep((current) =>
      Math.max(current - 1, 0)
    );
  };

  const handleBackClick = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();
    previousStep();
  };

  const handleFormSubmit = async (
    event: FormEvent
  ) => {
    event.preventDefault();

    if (step !== 4) {
      setError(
        "Complete the final step before submitting your profile for review."
      );
      return;
    }

    await submit(event);
  };

  const isPending = status === "pending";
  const providerPagePending = pageStatus === "pending";

  if (isPending || providerPagePending) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f5f7f2_100%)] pb-24 md:pb-8">
        <DashboardNav onCreatePage={openPage} pageStatus={pageStatus} />
        <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8">
          <BackHomeLink />
          <ReviewPendingState
            subject={providerPagePending ? "provider Page" : "student profile"}
          />
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f5f7f2_100%)] pb-24 md:pb-8">
      <DashboardNav
        onCreatePage={openPage}
        pageStatus={pageStatus}
      />

      <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8">
        <BackHomeLink />

        <h1 className="mt-6 text-3xl font-medium text-safecrib-black">
          Complete your student profile
        </h1>

        <p className="mt-3 max-w-xl text-sm leading-6 text-black/60">
          Complete your student details, then
          submit them for admin review from
          the final step.
        </p>

        {draftRestored && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-safecrib-green/20 bg-[#EAF7F1] px-4 py-3 text-sm text-safecrib-green">
            <span>
              Draft restored. Your progress
              is saved on this device.
            </span>

            <Button
              type="button"
              variant="secondary"
              className="border-safecrib-green/30 px-3 py-2 text-xs text-safecrib-green"
              onClick={discardDraft}
            >
              Discard draft
            </Button>
          </div>
        )}

        {status === "rejected" && (
          <div className="mt-6 rounded-[4px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p>
              Your profile was not approved.
              Update the details below and
              resubmit.
            </p>

            {rejectionReason && (
              <p className="mt-2">
                Reason: {rejectionReason}
              </p>
            )}
          </div>
        )}

        {step === 0 ? (
          <div className="mt-8 rounded-[12px] border border-black/10 bg-white p-6 shadow-[0_18px_40px_rgba(11,12,14,0.05)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-safecrib-green">
              Student profile
            </p>

            <h2 className="mt-3 text-2xl font-medium text-safecrib-black">
              Set up your profile in four
              steps
            </h2>

            <p className="mt-3 text-sm leading-6 text-black/60">
              Add your details, verification
              document, profile image, and
              contact information one step at
              a time. Nothing is submitted until
              you click the final button.
            </p>

            <Button
              type="button"
              className="mt-6"
              onClick={nextStep}
            >
              Start your profile
            </Button>
          </div>
        ) : (
          <form
            onSubmit={handleFormSubmit}
            className="mt-8 grid gap-5 rounded-[12px] border border-black/10 bg-white p-6 shadow-[0_18px_40px_rgba(11,12,14,0.05)] sm:grid-cols-2"
          >
            <div className="min-w-0 sm:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-safecrib-green">
                  Step {step} of 4
                </p>

                <span className="shrink-0 text-xs text-black/45">
                  {Math.round(
                    (step / 4) * 100
                  )}
                  %
                </span>
              </div>

              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-black/5">
                <div
                  className="h-full rounded-full bg-safecrib-green transition-[width] duration-300"
                  style={{
                    width: `${
                      (step / 4) * 100
                    }%`,
                  }}
                />
              </div>
            </div>

            {step === 1 && (
              <>
                {input(
                  "displayName",
                  "Display name",
                  true
                )}
                <label className="block text-sm font-medium text-safecrib-black sm:col-span-2">
                  Short bio * (shown in search, max 160 characters)
                  <textarea
                    required
                    maxLength={160}
                    rows={3}
                    value={form.shortBio ?? ""}
                    onChange={(event) => update("shortBio", event.target.value)}
                    className="mt-2 w-full resize-y rounded-[8px] border border-black/15 px-4 py-3 font-normal text-safecrib-black focus:border-safecrib-green focus:outline-none"
                    placeholder="A short introduction about yourself"
                  />
                  <span className="mt-1 block text-right text-xs font-normal text-black/45">{(form.shortBio ?? "").length}/160</span>
                </label>
                <label className="block text-sm font-medium text-safecrib-black sm:col-span-2">
                  Long bio (optional, max 2,000 characters)
                  <textarea
                    maxLength={2000}
                    rows={4}
                    value={form.longBio ?? ""}
                    onChange={(event) => update("longBio", event.target.value)}
                    className="mt-2 w-full resize-y rounded-[8px] border border-black/15 px-4 py-3 font-normal text-safecrib-black focus:border-safecrib-green focus:outline-none"
                    placeholder="Share more about yourself"
                  />
                  <span className="mt-1 block text-right text-xs font-normal text-black/45">{(form.longBio ?? "").length}/2,000</span>
                </label>

                <label className="block text-sm font-medium text-safecrib-black sm:col-span-2">
                  School of study *
                  <select
                    value={form.schoolOfStudy || FUTMINNA_SCHOOL_NAME}
                    onChange={(event) => update("schoolOfStudy", event.target.value)}
                    className="mt-2 w-full rounded-[8px] border border-black/15 px-4 py-3 font-normal text-safecrib-black focus:border-safecrib-green focus:outline-none"
                  >
                    <option value={FUTMINNA_SCHOOL_NAME}>{FUTMINNA_SCHOOL_NAME}</option>
                  </select>
                </label>

                <label className="block text-sm font-medium text-safecrib-black sm:col-span-2">
                  Course of study *
                  <input
                    type="text"
                    value={courseSearch}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setCourseSearch(nextValue);
                      setCourseSelectionLocked(false);
                      update("courseOfStudy", nextValue);
                    }}
                    onFocus={() => {
                      if (courseSelectionLocked) {
                        setCourseSelectionLocked(false);
                      }
                    }}
                    placeholder="Type to search course of study"
                    className="mt-2 w-full rounded-[8px] border border-black/15 px-4 py-3 font-normal text-safecrib-black focus:border-safecrib-green focus:outline-none"
                  />
                  {courseSearch.trim() !== "" && !courseSelectionLocked && courseSuggestions.length > 0 && (
                    <div className="mt-2 max-h-52 overflow-auto rounded-[8px] border border-black/10 bg-white shadow-sm">
                      {courseSuggestions.map((courseName) => (
                        <button
                          key={courseName}
                          type="button"
                          onClick={() => {
                            const selectedCourse = courseName;
                            update("courseOfStudy", selectedCourse);
                            setCourseSearch(selectedCourse);
                            setCourseSelectionLocked(true);
                          }}
                          className="block w-full border-b border-black/5 px-3 py-2 text-left text-sm text-safecrib-black transition-colors last:border-b-0 hover:bg-[#f3faf6]"
                        >
                          {courseName}
                        </button>
                      ))}
                    </div>
                  )}
                  {courseSearch.trim() !== "" && !courseSelectionLocked && courseSuggestions.length === 0 && (
                    <p className="mt-2 text-xs text-black/50">No course matches your search yet.</p>
                  )}
                </label>

                <label className="block text-sm font-medium text-safecrib-black">
                  Level *
                  <select
                    value={form.level}
                    onChange={(event) => update("level", event.target.value)}
                    className="mt-2 w-full rounded-[8px] border border-black/15 px-4 py-3 font-normal text-safecrib-black focus:border-safecrib-green focus:outline-none"
                  >
                    <option value="">Select level</option>
                    {LEVEL_OPTIONS.map((levelOption) => (
                      <option key={levelOption} value={levelOption}>{levelOption}</option>
                    ))}
                  </select>
                </label>
              </>
            )}

            {step === 2 && (
              <div className="sm:col-span-2 grid min-w-0 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <p className="text-lg font-medium text-safecrib-black">
                    Upload your verification
                    files
                  </p>

                  <p className="mt-1 text-sm leading-6 text-black/60">
                    Add your verification
                    document and profile image.
                    Uploading saves them for the
                    final review step; it does not
                    submit your profile.
                  </p>
                </div>

                <UploadAccordion
                  title="Proof of studentship document"
                  description="Required for student verification"
                  accept="application/pdf,image/*"
                  format="PDF or image · max 10 MB"
                  value={
                    form.proofOfStudentship
                  }
                  uploading={
                    uploadingStudentship
                  }
                  required
                  onUpload={(file) =>
                    void uploadStudentship(
                      file
                    )
                  }
                />

                <UploadAccordion
                  title="Profile image"
                  description="Required for your student profile"
                  accept="image/*"
                  format="JPG, PNG, or WebP · max 10 MB"
                  value={
                    form.profilePicture
                  }
                  uploading={
                    uploadingAvatar
                  }
                  required
                  onUpload={(file) =>
                    void uploadAvatar(file)
                  }
                />

                {pendingUploads.length >
                  0 && (
                  <div className="sm:col-span-2 rounded-[8px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <p className="font-medium">
                      Pending uploads
                    </p>

                    <p className="mt-1">
                      Cancel an unfinished upload
                      before trying again.
                    </p>

                    <div className="mt-3 space-y-2">
                      {pendingUploads.map(
                        (upload) => (
                          <div
                            key={upload.id}
                            className="flex flex-col items-start gap-2 rounded-[6px] border border-amber-900/10 p-2 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <span className="break-all">
                              {upload.purpose ??
                                "Upload"}
                            </span>

                            <Button
                              type="button"
                              variant="secondary"
                              className="px-3 py-2 text-xs"
                              loading={
                                cancellingUpload ===
                                upload.id
                              }
                              onClick={() =>
                                void cancelUpload(
                                  upload.id
                                )
                              }
                            >
                              Cancel
                            </Button>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <>
                <label className="block text-sm font-medium text-safecrib-black">
                  Date of birth *
                  <input
                    type="date"
                    min="1960-01-01"
                    max="2007-12-31"
                    value={form.dateOfBirth ?? ""}
                    onChange={(event) => update("dateOfBirth", event.target.value)}
                    className="mt-2 w-full rounded-[8px] border border-black/15 px-4 py-3 font-normal text-safecrib-black focus:border-safecrib-green focus:outline-none"
                  />
                </label>

                <label className="block text-sm font-medium text-safecrib-black">
                  Gender *
                  <select
                    value={form.gender}
                    onChange={(event) => update("gender", event.target.value)}
                    className="mt-2 w-full rounded-[8px] border border-black/15 px-4 py-3 font-normal text-safecrib-black focus:border-safecrib-green focus:outline-none"
                  >
                    <option value="">Select gender</option>
                    {GENDER_OPTIONS.map((genderOption) => (
                      <option key={genderOption} value={genderOption}>{genderOption}</option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm font-medium text-safecrib-black">
                  Phone number *
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={14}
                    autoComplete="tel"
                    value={form.phoneNumber ?? ""}
                    onChange={(event) => update("phoneNumber", normalizeNigerianPhone(event.target.value))}
                    placeholder="+2348012345678"
                    pattern="\+234[0-9]{10}"
                    className="mt-2 w-full rounded-[8px] border border-black/15 px-4 py-3 font-normal text-safecrib-black focus:border-safecrib-green focus:outline-none"
                  />
                  <span className="mt-1 block text-xs font-normal text-black/45">Use +234 and 10 digits after the prefix.</span>
                </label>

                <label className="block text-sm font-medium text-safecrib-black">
                  Emergency contact *
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={14}
                    autoComplete="tel"
                    value={form.emergencyContact ?? ""}
                    onChange={(event) => update("emergencyContact", normalizeNigerianPhone(event.target.value))}
                    placeholder="+2348012345678"
                    pattern="\+234[0-9]{10}"
                    className="mt-2 w-full rounded-[8px] border border-black/15 px-4 py-3 font-normal text-safecrib-black focus:border-safecrib-green focus:outline-none"
                  />
                  <span className="mt-1 block text-xs font-normal text-black/45">Must be different from your regular phone number.</span>
                </label>
              </>
            )}

            {step === 4 && (
              <>
                <label className="block text-sm font-medium text-safecrib-black">
                  LinkedIn link (optional)
                  <input
                    type="url"
                    value={form.linkedin ?? ""}
                    onChange={(event) => update("linkedin", event.target.value)}
                    placeholder="https://linkedin.com/in/your-name"
                    className="mt-2 w-full rounded-[8px] border border-black/15 px-4 py-3 font-normal text-safecrib-black focus:border-safecrib-green focus:outline-none"
                  />
                </label>

                <label className="block text-sm font-medium text-safecrib-black">
                  Website link (optional)
                  <input
                    type="url"
                    value={form.website ?? ""}
                    onChange={(event) => update("website", event.target.value)}
                    placeholder="https://yourwebsite.com"
                    className="mt-2 w-full rounded-[8px] border border-black/15 px-4 py-3 font-normal text-safecrib-black focus:border-safecrib-green focus:outline-none"
                  />
                </label>
              </>
            )}

            {error && (
              <p
                className="sm:col-span-2 text-sm text-red-600"
                role="alert"
              >
                {error}
              </p>
            )}

            <div className="sm:col-span-2 flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={handleBackClick}
              >
                Back
              </Button>

              {step < 4 ? (
                <Button
                  type="button"
                  onClick={handleNextClick}
                >
                  Next
                </Button>
              ) : (
                <Button
                  type="submit"
                  loading={saving}
                  disabled={
                    uploadingStudentship ||
                    uploadingAvatar
                  }
                >
                  {status === "rejected"
                    ? "Update and resubmit"
                    : "Submit for review"}
                </Button>
              )}
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
