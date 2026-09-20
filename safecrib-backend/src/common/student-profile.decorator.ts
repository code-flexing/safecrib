import { SetMetadata } from '@nestjs/common';

export const STUDENT_PROFILE_APPROVED_KEY = 'requireApprovedStudent';

export const RequireApprovedStudent = () => SetMetadata(STUDENT_PROFILE_APPROVED_KEY, true);