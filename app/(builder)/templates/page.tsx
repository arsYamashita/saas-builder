import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { TEMPLATE_CATALOG } from "@/lib/templates/template-catalog";
import {
  LayoutTemplate,
  Plus,
  CreditCard,
  Users,
  Database,
} from "lucide-react";

export default function TemplatesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
          <p className="text-sm text-muted-foreground">
            Choose a template to start building your SaaS application.
          </p>
        </div>
        <Button asChild>
          <Link href="/projects/new">
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {TEMPLATE_CATALOG.map((template) => (
          <Card key={template.templateKey} className="flex flex-col">
            <CardHeader>
              <div className="flex items-start justify-between">
                <LayoutTemplate className="h-8 w-8 text-muted-foreground" />
                <Badge
                  variant={
                    template.statusBadge === "GREEN" ? "success" : "secondary"
                  }
                >
                  {template.statusBadge}
                </Badge>
              </div>
              <CardTitle className="text-base mt-2">{template.label}</CardTitle>
              <CardDescription>{template.shortDescription}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Target Users
                </p>
                <p className="text-sm">{template.targetUsers}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Core Entities
                </p>
                <div className="flex flex-wrap gap-1">
                  {template.coreEntities.map((entity) => (
                    <Badge key={entity} variant="outline" className="text-xs">
                      <Database className="mr-1 h-3 w-3" />
                      {entity}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground">
                {template.includesBilling && (
                  <span className="flex items-center gap-1">
                    <CreditCard className="h-3 w-3" /> Billing
                  </span>
                )}
                {template.includesAffiliate && (
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" /> Affiliate
                  </span>
                )}
              </div>
            </CardContent>
            <CardFooter>
              <Button className="w-full" asChild>
                <Link href={`/projects/new?template=${template.templateKey}`}>
                  Use This Template
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
