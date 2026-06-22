import { IsString, IsNotEmpty, MinLength } from 'class-validator';
export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name!: string;
}
