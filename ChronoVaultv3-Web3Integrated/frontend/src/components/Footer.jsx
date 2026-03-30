export default function Footer() {
    return (
        <footer className="w-full border-t border-border/20 mt-auto bg-background/30 backdrop-blur-sm">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tracking-tight">CHRONOVAULT</span>
                    <span className="text-xs text-muted-foreground">© 2026</span>
                </div>
                <p className="text-xs text-muted-foreground">
                    Built by Ayushman, Aarushi, Nakshatra, Vishal, Shreena, Vipransh
                </p>
            </div>
        </footer>
    );
}