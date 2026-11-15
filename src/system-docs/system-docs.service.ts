import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { uploadToCloudinary } from '../lib/cloudinary';

export interface CreateSystemDocInput {
  title: string;
  category?: string;
  description?: string;
  uploadedBy: string; // admin id
  file: Express.Multer.File;
}

@Injectable()
export class SystemDocsService {
  constructor(private readonly prisma: PrismaService) {}

  async upload(input: CreateSystemDocInput) {
    const folder = `${process.env.CLOUDINARY_FOLDER ?? 'quza'}/system-docs`;

    const fileUrl = await uploadToCloudinary(
      input.file.buffer,
      folder,
      input.file.mimetype,
    );

    return this.prisma.client.systemDoc.create({
      data: {
        title: input.title.trim(),
        fileName: input.file.originalname,
        mimeType: input.file.mimetype,
        fileSize: input.file.size,
        fileUrl,
        category: input.category?.trim() || null,
        description: input.description?.trim() || null,
        uploadedBy: input.uploadedBy,
      },
    });
  }

  async findAll(category?: string) {
    return this.prisma.client.systemDoc.findMany({
      where: category ? { category } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const doc = await this.prisma.client.systemDoc.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException(`Document ${id} not found`);
    return doc;
  }

  async update(id: string, data: { title?: string; category?: string; description?: string }) {
    await this.findOne(id);
    return this.prisma.client.systemDoc.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title.trim() }),
        ...(data.category !== undefined && { category: data.category.trim() || null }),
        ...(data.description !== undefined && { description: data.description.trim() || null }),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.client.systemDoc.delete({ where: { id } });
    return { deleted: true };
  }

  /** All distinct category strings that have been used. */
  async listCategories(): Promise<string[]> {
    const rows = await this.prisma.client.systemDoc.findMany({
      where: { category: { not: null } },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });
    return rows.map((r) => r.category as string);
  }
}
