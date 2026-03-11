import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  role: string;
}

const SUPER_ADMIN_EQUIVALENT_ROLES = new Set(["super_admin", "chairman", "secretary", "treasurer"]);
const ALLOWED_ASSIGNABLE_ROLES = new Set([
  "chairman",
  "secretary",
  "treasurer",
  "zakat_officer",
  "fidyah_officer",
  "viewer",
]);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify requesting user has super-admin-equivalent privileges
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user: requestingUser },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !requestingUser) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if requesting user has super-admin-equivalent role
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUser.id);

    const canManageUsers = roles?.some((r) => SUPER_ADMIN_EQUIVALENT_ROLES.has(r.role));
    if (!canManageUsers) {
      return new Response(JSON.stringify({ error: "Only executive roles can create users" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, full_name, role }: CreateUserRequest = await req.json();

    if (!email || !password || !full_name || !role) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!ALLOWED_ASSIGNABLE_ROLES.has(role)) {
      return new Response(JSON.stringify({ error: "Invalid role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (password.length < 6) {
      return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create user with admin API (no invitation/confirmation email)
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      // Mark as confirmed so they can login immediately.
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createError) {
      const anyErr = createError as unknown as { code?: string; message?: string };
      if (anyErr?.code === "email_exists" || (anyErr?.message ?? "").includes("already been registered")) {
        // Expected validation case: do not log as error.
        console.log("Create user blocked: email already exists", { email });
        return new Response(JSON.stringify({ error: "User already exists" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.error("Create user error:", createError);
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const createdUserId = newUser.user?.id;
    if (!createdUserId) {
      return new Response(JSON.stringify({ error: "User creation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify profile was created by trigger, if not create it explicitly
    const { data: existingProfile, error: profileCheckError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", createdUserId)
      .maybeSingle();

    if (profileCheckError) {
      console.error("Profile check failed:", profileCheckError);
      await supabaseAdmin.auth.admin.deleteUser(createdUserId);
      return new Response(JSON.stringify({ error: "Failed to verify profile creation" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If profile doesn't exist (trigger didn't fire), create it manually
    if (!existingProfile) {
      const { error: profileInsertError } = await supabaseAdmin
        .from("profiles")
        .insert({
          id: createdUserId,
          email,
          full_name,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (profileInsertError) {
        console.error("Profile creation failed:", profileInsertError);
        await supabaseAdmin.auth.admin.deleteUser(createdUserId);
        return new Response(JSON.stringify({ error: "Failed to create user profile" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log("Profile created manually for user:", createdUserId);
    } else {
      console.log("Profile already exists (created by trigger) for user:", createdUserId);
    }

    // The handle_new_user trigger creates default 'viewer' role.
    // If the selected role is different, update it.
    if (role !== "viewer") {
      const { error: deleteRoleError } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", createdUserId)
        .eq("role", "viewer");

      if (deleteRoleError) {
        console.error("Role update failed (delete viewer):", deleteRoleError);
        await supabaseAdmin.auth.admin.deleteUser(createdUserId);
        return new Response(JSON.stringify({ error: "Failed to set user role" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: insertRoleError } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: createdUserId, role });

      if (insertRoleError) {
        console.error("Role update failed (insert role):", insertRoleError);
        await supabaseAdmin.auth.admin.deleteUser(createdUserId);
        return new Response(JSON.stringify({ error: "Failed to set user role" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: { id: newUser.user?.id, email: newUser.user?.email },
        message: "User created successfully",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
