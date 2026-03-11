import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  ClipboardList,
  LogOut, 
  User, 
  Crown, 
  Wallet, 
  HandCoins, 
  BookOpen, 
  Eye,
  Loader2,
  CheckCircle
} from 'lucide-react';

const roleIcons: Record<string, React.ReactNode> = {
  super_admin: <Crown className="h-4 w-4" />,
  chairman: <Shield className="h-4 w-4" />,
  secretary: <ClipboardList className="h-4 w-4" />,
  treasurer: <Wallet className="h-4 w-4" />,
  zakat_officer: <HandCoins className="h-4 w-4" />,
  fidyah_officer: <BookOpen className="h-4 w-4" />,
  viewer: <Eye className="h-4 w-4" />,
};

const roleLabels: Record<string, string> = {
  super_admin: 'Super Admin',
  chairman: 'Ketua',
  secretary: 'Sekretaris',
  treasurer: 'Bendahara',
  zakat_officer: 'Petugas Zakat',
  fidyah_officer: 'Petugas Fidyah',
  viewer: 'Viewer',
};

export default function Index() {
  const { user, profile, roles, loading, signOut, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const handleSignOut = async () => {
    await signOut();
    router.push('/auth');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
              <Shield className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Islamic Fund Management</h1>
              <p className="text-sm text-muted-foreground">Secure Dashboard</p>
            </div>
          </div>
          <Button variant="outline" onClick={handleSignOut} className="gap-2">
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
          {/* Welcome Card */}
          <Card className="shadow-lg border-border/50">
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center">
                  <User className="h-8 w-8 text-accent-foreground" />
                </div>
                <div>
                  <CardTitle className="text-2xl">
                    Welcome, {profile?.full_name || user.email}
                  </CardTitle>
                  <CardDescription className="text-base">
                    {user.email}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Roles Card */}
          <Card className="shadow-lg border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Your Roles
              </CardTitle>
              <CardDescription>
                Access permissions assigned to your account
              </CardDescription>
            </CardHeader>
            <CardContent>
              {roles.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                  {roles.map((role) => (
                    <Badge 
                      key={role} 
                      variant="secondary"
                      className="px-4 py-2 text-sm font-medium gap-2"
                    >
                      {roleIcons[role]}
                      {roleLabels[role] || role}
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No roles assigned yet.</p>
                  <p className="text-sm mt-1">Contact an administrator to get access.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Access Summary */}
          <Card className="shadow-lg border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-success" />
                Access Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                  <p className="text-sm font-medium text-muted-foreground">Admin Access</p>
                  <p className="text-lg font-semibold text-foreground mt-1">
                    {isAdmin() ? 'Yes' : 'No'}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                  <p className="text-sm font-medium text-muted-foreground">Total Roles</p>
                  <p className="text-lg font-semibold text-foreground mt-1">
                    {roles.length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Role Permissions Guide */}
          <Card className="shadow-lg border-border/50">
            <CardHeader>
              <CardTitle>Role Permissions Guide</CardTitle>
              <CardDescription>
                Understanding what each role can do
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(roleLabels).map(([key, label]) => (
                  <div 
                    key={key}
                    className="p-4 rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-primary">{roleIcons[key]}</span>
                      <span className="font-medium text-foreground">{label}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {key === 'super_admin' && 'Full system access and user management'}
                      {key === 'chairman' && 'Full system access and organizational leadership'}
                      {key === 'secretary' && 'Full system access and administrative management'}
                      {key === 'treasurer' && 'Full system access and financial management'}
                      {key === 'zakat_officer' && 'Zakat collection and distribution'}
                      {key === 'fidyah_officer' && 'Fidyah management and records'}
                      {key === 'viewer' && 'Read-only access to data'}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
