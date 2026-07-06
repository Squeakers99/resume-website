"use server";

import { revalidatePath } from "next/cache";
import { getOwnerSession } from "@/lib/auth";
import {
  createGoogleEvent,
  deleteGoogleEvent,
  getGoogleAccessToken,
} from "@/lib/google-calendar";
import {
  objectExists,
  presignImagePut,
  projectImageKey,
  publicObjectUrl,
} from "@/lib/s3";
import {
  createDashboardProject,
  createTask,
  deleteTask,
  patchProjectImages,
  updateTaskStatus,
} from "@/lib/server-api";

// Server actions are public HTTP endpoints — every one of them must
// re-verify the session, independently of the layout gate.
async function assertOwner(): Promise<void> {
  const session = await getOwnerSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
}

export type ActionResult = { ok: boolean; error?: string };

function toResult(error: unknown): ActionResult {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "Something went wrong",
  };
}

export async function addTaskAction(input: {
  title: string;
  priority: string;
  status: string;
}): Promise<ActionResult> {
  try {
    await assertOwner();
    await createTask(input);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

export async function moveTaskAction(id: string, status: string): Promise<ActionResult> {
  try {
    await assertOwner();
    await updateTaskStatus(id, status);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

export async function deleteTaskAction(id: string): Promise<ActionResult> {
  try {
    await assertOwner();
    await deleteTask(id);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

export async function addEventAction(input: {
  title: string;
  date: string;
}): Promise<ActionResult> {
  try {
    await assertOwner();
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) {
      return {
        ok: false,
        error: "Google Calendar is not connected — sign out and back in.",
      };
    }
    await createGoogleEvent(accessToken, input);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

export async function deleteEventAction(id: string): Promise<ActionResult> {
  try {
    await assertOwner();
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) {
      return {
        ok: false,
        error: "Google Calendar is not connected — sign out and back in.",
      };
    }
    await deleteGoogleEvent(accessToken, id);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

export type SubmitProjectResult = {
  ok: boolean;
  message: string;
  projectId?: string;
  mainUploadUrl?: string;
  secondaryUploadUrls?: string[];
};

// Creates the project, then hands the browser presigned PUT URLs so files go
// straight to S3 (project/{id}/main, project/{id}/secondary{i}).
export async function submitProjectAction(input: {
  title: string;
  description: string;
  githubUrl: string;
  tags: string[];
  mainImageType?: string;
  secondaryImageTypes: string[];
}): Promise<SubmitProjectResult> {
  try {
    await assertOwner();

    const title = input.title.trim();
    const description = input.description.trim();
    if (!title || !description) {
      return { ok: false, message: "Project name and description are required" };
    }

    const { id } = await createDashboardProject({
      title,
      description,
      githubUrl: input.githubUrl.trim(),
      imageUrl: "",
      tags: input.tags.map((t) => t.trim()).filter(Boolean),
    });

    const mainUploadUrl = input.mainImageType
      ? await presignImagePut(projectImageKey(id, "main"), input.mainImageType)
      : undefined;

    const secondaryUploadUrls = await Promise.all(
      input.secondaryImageTypes.map((type, i) =>
        presignImagePut(projectImageKey(id, i + 1), type)
      )
    );

    revalidatePath("/dashboard");
    revalidatePath("/projects");
    return {
      ok: true,
      message: `Project "${title}" created`,
      projectId: id,
      mainUploadUrl,
      secondaryUploadUrls,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Something went wrong",
    };
  }
}

// After the browser finishes uploading, verify the objects actually exist in
// S3 (server-authoritative) and store their public URLs on the project.
export async function finalizeProjectImagesAction(
  projectId: string,
  secondaryCount: number
): Promise<ActionResult> {
  try {
    await assertOwner();

    const update: { imageUrl?: string; secondaryImages?: string[] } = {};

    const mainKey = projectImageKey(projectId, "main");
    if (await objectExists(mainKey)) {
      update.imageUrl = publicObjectUrl(mainKey);
    }

    const secondaryImages: string[] = [];
    for (let i = 1; i <= secondaryCount; i++) {
      const key = projectImageKey(projectId, i);
      if (await objectExists(key)) {
        secondaryImages.push(publicObjectUrl(key));
      }
    }
    update.secondaryImages = secondaryImages;

    await patchProjectImages(projectId, update);
    revalidatePath("/dashboard");
    revalidatePath("/projects");
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}
