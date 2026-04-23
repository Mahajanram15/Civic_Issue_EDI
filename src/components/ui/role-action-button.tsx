import { useNavigate } from "react-router-dom";
import { Settings, Plus, Wrench, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface RoleActionButtonProps {
  className?: string;
  size?: 'default' | 'sm' | 'lg' | 'icon';
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  showArrow?: boolean;
  onClick?: () => void;
}

export function RoleActionButton({ 
  className, 
  size = "default", 
  variant = "default",
  showArrow = false,
  onClick
}: RoleActionButtonProps) {
  const { role, user } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return (
      <Button 
        size={size} 
        variant={variant} 
        className={cn("gap-2", className)} 
        onClick={() => {
          if (onClick) onClick();
          navigate('/register');
        }}
      >
        Get Started Free
        {showArrow && <ArrowRight className="h-4 w-4" />}
      </Button>
    );
  }

  const getButtonConfig = (currentRole: string | null) => {
    switch (currentRole) {
      case "admin":
        return {
          text: "Go to Admin Dashboard",
          icon: Settings,
          action: () => navigate("/admin"),
        };
      case "worker":
        return {
          text: "View Tasks",
          icon: Wrench,
          action: () => navigate("/worker"),
        };
      case "user":
      default:
        return {
          text: "Report Issue",
          icon: Plus,
          action: () => navigate("/report"),
        };
    }
  };

  const config = getButtonConfig(role);
  const Icon = config.icon;

  return (
    <Button 
      size={size} 
      variant={variant}
      className={cn("gap-2", className)}
      onClick={() => {
        if (onClick) onClick();
        config.action();
      }}
    >
      <Icon className="h-4 w-4" />
      {config.text}
      {showArrow && <ArrowRight className="h-4 w-4" />}
    </Button>
  );
}
