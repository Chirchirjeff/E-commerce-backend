// src/users/users.service.ts

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // CREATE USER
  async create(createUserDto: CreateUserDto) {
    const { email, password, name } = createUserDto;

    // 1. Check if user already exists
    const existingUser = await this.prisma.client.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // 2. Create user in DB
    return this.prisma.client.user.create({
      data: {
        email,
        password, // later we will HASH this (bcrypt)
        name,
      },
    });
  }

  // GET ALL USERS
  async findAll() {
    return this.prisma.client.user.findMany({
      include: {
        shops: true,
        orders: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // GET SINGLE USER
  async findOne(id: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id },
      include: {
        shops: true,
        orders: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  // UPDATE USER
  async update(id: string, updateUserDto: UpdateUserDto) {
    await this.findOne(id); // ensures user exists first

    return this.prisma.client.user.update({
      where: { id },
      data: updateUserDto,
    });
  }

  // DELETE USER
  async remove(id: string) {
    await this.findOne(id); // ensures user exists first

    return this.prisma.client.user.delete({
      where: { id },
    });
  }
}