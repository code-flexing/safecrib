#!/usr/bin/env node
/**
 * sync-presets.ts
 *
 * Creates or updates Cloudinary upload presets for every media purpose.
 * Run this as part of deployment: npm run cloudinary:sync-presets
 *
 * Requirements:
 *   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
 *   CLOUDINARY_ENV_PREFIX (default: dev)
 *   CLOUDINARY_WEBHOOK_URL (the URL Cloudinary will POST notifications to)
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/sync-presets.ts
 */

import { config } from 'dotenv';
config({ path: '.env' });

import { v2 as cloudinary } from 'cloudinary';

// ─── Config ───────────────────────────────────────────────────────────────────

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;
const envPrefix = process.env.CLOUDINARY_ENV_PREFIX || 'dev';
const webhookUrl = process.env.CLOUDINARY_WEBHOOK_URL || '';

if (!cloudName || !apiKey || !apiSecret) {
  console.error(
    'ERROR: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET must be set.',
  );
  process.exit(1);
}

cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });

// ─── Preset definitions ────────────────────────────────────────────────────────

interface PresetDef {
  name: string;
  folder: string;
  resourceType: string;
  deliveryType: 'upload' | 'authenticated' | 'private';
  allowedFormats: string[];
  maxBytes: number;
  /** Eager transformations run asynchronously after upload */
  eagerTransformations?: string[];
  /** Whether Cloudinary should send a webhook notification */
  notificationUrl?: string;
  /** Optional streaming profile for video */
  streamingProfile?: string;
  /** Whether to auto-moderate (Cloudinary moderation add-on) */
  moderation?: string;
}

const MB = 1024 * 1024;

const presets: PresetDef[] = [
  {
    name: 'sc_avatar',
    folder: `${envPrefix}/users/avatar`,
    resourceType: 'image',
    deliveryType: 'upload',
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    maxBytes: 5 * MB,
    eagerTransformations: ['c_fill,w_64,h_64,f_auto,q_auto', 'c_fill,w_200,h_200,f_auto,q_auto'],
    notificationUrl: webhookUrl,
  },
  {
    name: 'sc_cover_photo',
    folder: `${envPrefix}/users/cover-photo`,
    resourceType: 'image',
    deliveryType: 'upload',
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
    maxBytes: 10 * MB,
    eagerTransformations: [
      'c_fill,w_800,h_200,f_auto,q_auto',
      'c_fill,w_1200,h_400,f_auto,q_auto',
    ],
    notificationUrl: webhookUrl,
  },
  {
    name: 'sc_photo',
    folder: `${envPrefix}/listings/photo`,
    resourceType: 'image',
    deliveryType: 'upload',
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
    maxBytes: 15 * MB,
    eagerTransformations: [
      'c_fill,w_80,h_60,f_auto,q_auto',
      'c_fill,w_400,h_300,f_auto,q_auto',
      'c_fill,w_1200,h_800,f_auto,q_auto',
    ],
    notificationUrl: webhookUrl,
  },
  {
    name: 'sc_video',
    folder: `${envPrefix}/listings/video`,
    resourceType: 'video',
    deliveryType: 'upload',
    allowedFormats: ['mp4', 'mov', 'avi', 'webm'],
    maxBytes: 500 * MB,
    eagerTransformations: [
      'f_jpg,q_auto,so_0', // poster thumbnail
      'sp_hd/m3u8', // HLS streaming
    ],
    streamingProfile: 'hd',
    notificationUrl: webhookUrl,
  },
  {
    name: 'sc_logo',
    folder: `${envPrefix}/providers/logo`,
    resourceType: 'image',
    deliveryType: 'upload',
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'svg'],
    maxBytes: 5 * MB,
    eagerTransformations: ['c_fit,w_200,h_200,f_auto,q_auto'],
    notificationUrl: webhookUrl,
  },
  {
    name: 'sc_student_id',
    folder: `${envPrefix}/verification/student-id`,
    resourceType: 'image',
    deliveryType: 'authenticated',
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
    maxBytes: 10 * MB,
    notificationUrl: webhookUrl,
    moderation: 'aws_rek', // Enable auto-moderation if add-on enabled
  },
  {
    name: 'sc_proof_of_studentship',
    folder: `${envPrefix}/verification/proof-of-studentship`,
    resourceType: 'image',
    deliveryType: 'authenticated',
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
    maxBytes: 10 * MB,
    notificationUrl: webhookUrl,
  },
  {
    name: 'sc_proof_of_license',
    folder: `${envPrefix}/verification/proof-of-license`,
    resourceType: 'image',
    deliveryType: 'authenticated',
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
    maxBytes: 10 * MB,
    notificationUrl: webhookUrl,
  },
  {
    name: 'sc_contract',
    folder: `${envPrefix}/contracts/contract`,
    resourceType: 'raw',
    deliveryType: 'private',
    allowedFormats: ['pdf'],
    maxBytes: 25 * MB,
    notificationUrl: webhookUrl,
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function syncPresets(): Promise<void> {
  console.log(`\nSyncing ${presets.length} Cloudinary upload presets for env="${envPrefix}"...\n`);

  for (const preset of presets) {
    try {
      const params: Record<string, unknown> = {
        folder: preset.folder,
        resource_type: preset.resourceType,
        type: preset.deliveryType,
        allowed_formats: preset.allowedFormats.join(','),
        max_file_size: preset.maxBytes,
        unsigned: false, // All presets are signed
        overwrite: true,
        invalidate: true,
      };

      if (preset.eagerTransformations?.length) {
        params.eager = preset.eagerTransformations.join('|');
        params.eager_async = true;
        params.eager_notification_url = preset.notificationUrl || '';
      }

      if (preset.notificationUrl) {
        params.notification_url = preset.notificationUrl;
      }

      if (preset.streamingProfile) {
        params.streaming_profile = preset.streamingProfile;
      }

      // Only add moderation if the param is set (requires add-on)
      if (preset.moderation) {
        params.moderation = preset.moderation;
      }

      // Try to update; create if not exists
      try {
        await (cloudinary.api as any).update_upload_preset(preset.name, params);
        console.log(`  ✓ Updated: ${preset.name}`);
      } catch (err: any) {
        if (err?.error?.http_code === 404 || err?.http_code === 404) {
          await (cloudinary.api as any).create_upload_preset({ name: preset.name, ...params });
          console.log(`  ✓ Created: ${preset.name}`);
        } else {
          throw err;
        }
      }
    } catch (err) {
      console.error(`  ✗ Failed: ${preset.name}`, (err as Error).message);
      process.exitCode = 1;
    }
  }

  // Sync named transformations
  const named: Record<string, string> = {
    avatar_sm: 'c_fill,w_64,h_64,f_auto,q_auto',
    avatar_md: 'c_fill,w_200,h_200,f_auto,q_auto',
    listing_card: 'c_fill,w_400,h_300,f_auto,q_auto',
    listing_hero: 'c_fill,w_1200,h_800,f_auto,q_auto',
    listing_thumb: 'c_fill,w_80,h_60,f_auto,q_auto',
    video_poster: 'f_jpg,q_auto,so_0',
  };

  console.log(`\nSyncing ${Object.keys(named).length} named transformations...\n`);

  for (const [name, transform] of Object.entries(named)) {
    try {
      try {
        await (cloudinary.api as any).update_transformation(name, { allowed_for_strict: true, transformation: transform });
        console.log(`  ✓ Updated transformation: ${name}`);
      } catch {
        await (cloudinary.api as any).create_transformation(name, { allowed_for_strict: true, transformation: transform });
        console.log(`  ✓ Created transformation: ${name}`);
      }
    } catch (err) {
      console.error(`  ✗ Failed transformation: ${name}`, (err as Error).message);
      process.exitCode = 1;
    }
  }

  if (process.exitCode === 1) {
    console.error('\n⚠  Some presets/transformations failed. Check errors above.');
  } else {
    console.log('\n✅  All presets and transformations synced successfully.');
  }
}

syncPresets().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
