import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Mail, Lock, Loader2, Sparkles, CheckCircle2 } from 'lucide-react';
import { z } from 'zod';

const emailSchema = z.string().email('Please enter a valid email address');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  
  const { signIn, user, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (!loading && user) {
      router.replace('/');
    }
  }, [user, loading, router]);

  const validateForm = () => {
    const newErrors: { email?: string; password?: string } = {};
    
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      newErrors.email = emailResult.error.errors[0].message;
    }
    
    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) {
      newErrors.password = passwordResult.error.errors[0].message;
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    setIsSubmitting(true);
    const { error } = await signIn(email, password);
    setIsSubmitting(false);

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Gagal masuk',
        description: error.message === 'Invalid login credentials' 
          ? 'Email atau password tidak valid.'
          : error.message,
      });
    } else {
      toast({
        title: 'Berhasil masuk',
        description: 'Selamat datang di AmanahZIS.',
      });
      router.push('/');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(1200px_circle_at_15%_10%,hsl(var(--primary)/0.18),transparent_45%),radial-gradient(900px_circle_at_85%_90%,hsl(188_85%_40%/0.2),transparent_40%),linear-gradient(140deg,hsl(154_37%_8%)_0%,hsl(191_67%_10%)_55%,hsl(210_46%_12%)_100%)]">
      <div className="pointer-events-none absolute -left-24 top-10 h-64 w-64 rounded-full bg-emerald-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-8 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid w-full items-stretch gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="hidden overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 text-white shadow-2xl backdrop-blur-xl lg:flex lg:flex-col lg:justify-between">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-400/15 px-3 py-1 text-xs font-medium tracking-wide text-emerald-100">
                <Sparkles className="h-3.5 w-3.5" />
                Platform Operasional ZIS
              </div>
              <h1 className="text-3xl font-semibold leading-tight">
                AmanahZIS
              </h1>
              <p className="max-w-md text-sm text-white/75">
                Sistem manajemen zakat fitrah, zakat mal, fidyah, perhitungan batch, dan pendistribusian mustahik untuk operasional masjid.
              </p>
            </div>
            <div className="space-y-3">
              {[
                'Audit transaksi dan role terintegrasi',
                'Perhitungan distribusi bertahap per batch',
                'Tampilan dashboard real-time untuk panitia',
              ].map((point) => (
                <div key={point} className="flex items-center gap-2 text-sm text-white/90">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </section>

          <Card className="mx-auto w-full max-w-xl rounded-3xl border border-white/15 bg-white/95 shadow-[0_30px_80px_-32px_rgba(0,0,0,0.55)] backdrop-blur-xl">
            <CardHeader className="space-y-3 pb-3">
              <div className="flex items-center justify-center">
                <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-md">
                  <Image
                    src="/logo.png"
                    alt="AmanahZIS Logo"
                    fill
                    sizes="64px"
                    className="object-cover"
                    priority
                  />
                </div>
              </div>
              <div className="text-center">
                <CardTitle className="text-2xl font-semibold tracking-tight text-slate-900">
                  Masuk ke AmanahZIS
                </CardTitle>
                <CardDescription className="mt-1 text-sm text-slate-500">
                  Registrasi akun dinonaktifkan. Hubungi admin jika butuh akses baru.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email" className="text-slate-700">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="nama@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-11 rounded-xl border-slate-200 pl-10 text-[15px] focus-visible:ring-emerald-400"
                      required
                    />
                  </div>
                  {errors.email && (
                    <p className="text-xs text-destructive">{errors.email}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signin-password" className="text-slate-700">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="signin-password"
                      type="password"
                      placeholder="Masukkan password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 rounded-xl border-slate-200 pl-10 text-[15px] focus-visible:ring-emerald-400"
                      required
                    />
                  </div>
                  {errors.password && (
                    <p className="text-xs text-destructive">{errors.password}</p>
                  )}
                </div>

                <Button type="submit" className="h-11 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:from-emerald-600 hover:to-cyan-600" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Memproses...
                    </>
                  ) : (
                    'Masuk'
                  )}
                </Button>
              </form>

              <p className="mt-5 text-center text-xs leading-relaxed text-slate-500">
                AmanahZIS digunakan untuk operasional resmi panitia zakat. Aktivitas login dan transaksi terekam untuk audit.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
