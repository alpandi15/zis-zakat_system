import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UpdatePasswordRequest {
  user_id: string;
  password: string;
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * Mengganti password pengguna lain. Hanya role `super_admin` murni yang boleh —
 * role setara (ketua, sekretaris, bendahara) sengaja tidak diizinkan.
 */
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No authorization header" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user: requestingUser },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !requestingUser) return json({ error: "Invalid token" }, 401);

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUser.id);

    const isSuperAdmin = roles?.some((r) => r.role === "super_admin");
    if (!isSuperAdmin) {
      return json({ error: "Hanya Super Admin yang dapat mengubah password pengguna lain", code: "FORBIDDEN" }, 403);
    }

    const { user_id, password }: UpdatePasswordRequest = await req.json();

    if (!user_id || !password) return json({ error: "Missing required fields" }, 400);
    if (typeof password !== "string" || password.length < 6) {
      return json({ error: "Password must be at least 6 characters" }, 400);
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user_id, { password });

    if (updateError) {
      console.error("Update password error:", updateError);
      return json({ error: updateError.message }, 400);
    }

    console.log("Password updated", { target: user_id, by: requestingUser.id });
    return json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    console.error("Error:", error);
    return json({ error: "Internal server error" }, 500);
  }
});
