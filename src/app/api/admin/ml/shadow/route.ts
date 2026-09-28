import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, isAdmin } from "@/lib/session";
import { evaluateShadowPerformance } from "@/lib/prediction/shadow-evaluation";
import { getPredictionMode } from "@/lib/prediction/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (!(await isAdmin())) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const modelVersion =
      request.nextUrl.searchParams.get("modelVersion") || undefined;
    const evaluation = await evaluateShadowPerformance(modelVersion);

    return NextResponse.json({
      mode: getPredictionMode(),
      evaluation,
    });
  } catch (error) {
    console.error("Failed to evaluate shadow predictions:", error);
    return NextResponse.json(
      { error: "Failed to evaluate shadow predictions" },
      { status: 500 }
    );
  }
}
