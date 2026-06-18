"use client";

import * as React from "react";
import { CircleNotch } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { UploadState } from "./doc-uploader";

interface BusinessFormProps {
  onSubmit: (data: { companyName: string; industry: string; description: string }) => Promise<void>;
  state: UploadState;
  disabled?: boolean;
}

export function BusinessForm({ onSubmit, state, disabled }: BusinessFormProps) {
  const [companyName, setCompanyName] = React.useState("");
  const [industry, setIndustry] = React.useState("");
  const [description, setDescription] = React.useState("");

  const isLoading = state.status === "analyzing";
  const isDisabled = disabled || isLoading;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void onSubmit({ companyName, industry, description });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="company-name">
            Company name
          </label>
          <Input
            id="company-name"
            placeholder="e.g. Lakeside Dental"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
            disabled={isDisabled}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="industry">
            Industry
          </label>
          <Input
            id="industry"
            placeholder="e.g. dental clinic"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            required
            disabled={isDisabled}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="description">
            Description
          </label>
          <Textarea
            id="description"
            placeholder="Briefly describe what makes your business unique — hours, specialties, anything a caller should know"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            disabled={isDisabled}
          />
        </div>

        {state.status === "error" && (
          <p className="text-xs text-destructive" role="alert">
            {state.message}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={isDisabled}>
          {isLoading ? (
            <>
              <CircleNotch className="size-4 animate-spin" />
              Generating…
            </>
          ) : (
            "Generate guidelines"
          )}
        </Button>
      </div>
    </form>
  );
}
