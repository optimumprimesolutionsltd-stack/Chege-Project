import { useAuth } from '@workspace/replit-auth-web';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage() {
  const { login } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-secondary/10 blur-3xl pointer-events-none" />
      
      <div className="w-full max-w-md p-4 relative z-10">
        <Card className="border-none shadow-2xl bg-white/80 backdrop-blur-sm">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mb-4 shadow-lg transform -rotate-6">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 text-primary-foreground">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <CardTitle className="text-3xl font-bold font-display text-foreground">Family Budget</CardTitle>
            <CardDescription className="text-base mt-2 font-medium">
              Manage your family's finances together with clarity and confidence.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <Button onClick={login} size="lg" className="w-full text-lg h-14 rounded-xl shadow-md transition-transform hover:scale-[1.02]">
              Sign In to Continue
            </Button>
            <p className="text-center text-xs text-muted-foreground mt-6">
              Secure authentication via Replit
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
