import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4 animate-fade-in">
            <h1 className="text-8xl sm:text-9xl font-extrabold tracking-tighter text-primary/15 mb-2 select-none">
                404
            </h1>
            <h2 className="text-2xl font-bold mb-2">Page Not Found</h2>
            <p className="text-sm text-muted-foreground mb-8 max-w-sm leading-relaxed">
                The vault or page you're looking for has been moved, encrypted, or doesn't exist on the network.
            </p>
            <Button asChild className="gap-2">
                <Link to="/">
                    <ArrowLeft className="h-4 w-4" />
                    Return to Terminal
                </Link>
            </Button>
        </div>
    );
}