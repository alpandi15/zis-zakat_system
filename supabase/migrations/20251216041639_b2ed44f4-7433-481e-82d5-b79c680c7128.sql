-- Create distribution_assignments table for staff assignment feature
CREATE TABLE public.distribution_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_id uuid NOT NULL REFERENCES public.periods(id) ON DELETE CASCADE,
  mustahik_id uuid NOT NULL REFERENCES public.mustahik(id) ON DELETE CASCADE,
  assigned_to uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'not_delivered')),
  delivery_notes text,
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  delivered_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  -- Prevent duplicate assignments for same mustahik/period/staff
  UNIQUE (period_id, mustahik_id, assigned_to)
);

-- Enable RLS
ALTER TABLE public.distribution_assignments ENABLE ROW LEVEL SECURITY;

-- Admins can view all assignments
CREATE POLICY "Admins can view all assignments"
ON public.distribution_assignments
FOR SELECT
USING (is_admin(auth.uid()));

-- Assigned staff can view their own assignments
CREATE POLICY "Staff can view their own assignments"
ON public.distribution_assignments
FOR SELECT
USING (assigned_to = auth.uid());

-- Admins can create assignments
CREATE POLICY "Admins can create assignments"
ON public.distribution_assignments
FOR INSERT
WITH CHECK (is_admin(auth.uid()));

-- Admins can update all assignments
CREATE POLICY "Admins can update assignments"
ON public.distribution_assignments
FOR UPDATE
USING (is_admin(auth.uid()));

-- Assigned staff can update their own assignments (for delivery status)
CREATE POLICY "Staff can update their own assignments"
ON public.distribution_assignments
FOR UPDATE
USING (assigned_to = auth.uid());

-- Admins can delete assignments
CREATE POLICY "Admins can delete assignments"
ON public.distribution_assignments
FOR DELETE
USING (is_admin(auth.uid()));

-- Add trigger for updated_at
CREATE TRIGGER update_distribution_assignments_updated_at
BEFORE UPDATE ON public.distribution_assignments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();