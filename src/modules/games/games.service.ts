import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Game } from './game.model';

export class GamesService {
  constructor(
    @InjectModel(Game.name) private repository: Model<Game>,
  ) {}

  async getBySlug(slug: string): Promise<Game> {
    return this.repository.findOne({ slug });
  }
}