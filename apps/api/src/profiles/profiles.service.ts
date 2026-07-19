import { Injectable, NotFoundException } from '@nestjs/common';
import type { Profile } from '@karu/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdateProfileDto } from './dto';

@Injectable()
export class ProfilesService {
  constructor(private readonly supabase: SupabaseService) {}

  async getById(id: string): Promise<Profile> {
    const { data, error } = await this.supabase.db
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) throw new NotFoundException('Profile not found');
    return data as Profile;
  }

  async update(id: string, dto: UpdateProfileDto): Promise<Profile> {
    const { data, error } = await this.supabase.db
      .from('profiles')
      .update(dto)
      .eq('id', id)
      .select('*')
      .single();
    if (error || !data) throw new NotFoundException('Profile not found');
    return data as Profile;
  }
}
