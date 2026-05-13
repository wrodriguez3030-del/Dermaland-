"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { ProductImageUploader } from "./components/product-image-uploader";
import { updateProduct, useProduct } from "./product-store";

interface Props {
  productId: string;
}

export function EditProductImageCard({ productId }: Props) {
  const product = useProduct(productId);
  const toast = useToast();

  if (!product) return null;

  const handleChange = (imageUrl: string | null) => {
    updateProduct(productId, {
      imageUrl,
      imageAlt: imageUrl ? (product.imageAlt ?? product.name) : null,
    });
    toast.success(
      imageUrl
        ? "Imagen del producto actualizada."
        : "Imagen eliminada.",
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Imagen del producto</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductImageUploader
            value={product.imageUrl}
            alt={product.imageAlt ?? product.name}
            onChange={handleChange}
          />
        </CardContent>
      </Card>
      <toast.Toast />
    </>
  );
}
