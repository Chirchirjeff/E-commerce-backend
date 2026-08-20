import {
  IsString,
  IsNotEmpty,
  MinLength,
  IsOptional,
  IsEnum,
} from 'class-validator';

export enum AttributeType {
  TEXT = 'text',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  SELECT = 'select',
  MULTISELECT = 'multiselect',
  DATE = 'date',
}

export class CreateAttributeDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Attribute name must be at least 2 characters' })
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Attribute slug must be at least 2 characters' })
  slug!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(AttributeType, {
    message: `Attribute type must be one of: ${Object.values(AttributeType).join(', ')}`,
  })
  type!: AttributeType;
}
