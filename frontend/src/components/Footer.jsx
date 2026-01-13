// frontend/src/components/Footer.jsx
import { Code2 } from 'lucide-react';

export function Footer() {
    return (
        <footer className="py-8 border-t border-white/5 bg-black/50">
            <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <Code2 className="w-5 h-5 text-cyan-400" />
                    <span className="font-heading font-bold text-white">Webcrafters Studio</span>
                </div>
                <p className="text-gray-500 text-sm">
                    &copy; {new Date().getFullYear()} Webcrafters Studio. AI-Powered Code Generation.
                </p>
            </div>
        </footer>
    );
}
